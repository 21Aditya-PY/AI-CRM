"""
HCP CRM LangGraph Agent - PRODUCTION READY
Fixes:
  - Robust JSON parsing (strips markdown fences, regex fallback)
  - topics_discussed never contains raw input
  - run_agent returns extracted_data + tool_used for frontend sync
"""
import os
from dotenv import load_dotenv
load_dotenv() 
import re
import json
import uuid
import ast
import logging
from datetime import datetime
from typing import TypedDict, Annotated

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_groq import ChatGroq
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from db.database import (
    AsyncSessionLocal, save_interaction_db, get_interactions_db,
    get_interaction_by_id_db, update_interaction_db
)

logger = logging.getLogger(__name__)

def get_llm():
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant") 
    if not api_key:
        raise ValueError("Missing required environment variable: GROQ_API_KEY")
    
    if not model:
        raise ValueError("Missing required environment variable: GROQ_MODEL")
    
    logger.info(f" Loaded Groq LLM: {model}")
    return ChatGroq(
        api_key=api_key, 
        model=model, 
        temperature=0.1, 
        max_tokens=2048
    )

def _parse_llm_json(raw: str) -> dict:
    """
    Strips markdown fences and extracts the first JSON object found.
    Raises ValueError if no valid JSON found.
    """
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned, flags=re.MULTILINE).strip()
    match = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object found in LLM response: {raw[:200]}")
    return json.loads(match.group())


@tool
async def log_interaction_smart(raw_input: str) -> dict:
    """
    Parses natural language notes → Extracts structured entities → Logs to PostgreSQL.
    Uses a dedicated second LLM call for topics_discussed so Gemma can't cheat.
    """
    llm = get_llm()
    extract_prompt = f"""Extract HCP interaction details from field rep notes.
Return ONLY a valid JSON object. No markdown, no extra text, no explanation.

NOTES: {raw_input}
CRITICAL RULES:
- hcp_name: PRIMARY DOCTOR ONLY (Dr. Mehta) - NOT nurses/team
- attendees: ALL OTHER PEOPLE (nurse Sarah, team, staff) - empty "" if alone
- interaction_type: EXACT: Meeting/Phone Call/Email/Conference/Virtual Meeting/CME Event

JSON structure to return:
{{
  "hcp_name": "Full doctor name with Dr. prefix e.g. Dr. Priya Singh",
  "attendees": "ONLY if EXPLICITLY mentioned e.g. nurse Sarah, team OR empty string",
  "interaction_type": "EXACT: Meeting/Phone Call/Email/Conference/Virtual Meeting/CME Event",
  "sentiment": "Positive/Negative/Neutral",
  "materials_shared": "comma-separated list of any PDFs, brochures, materials given",
  "samples_distributed": "number and type of samples given, or empty string",
  "outcomes": "what the HCP agreed to or committed to",
  "follow_up_actions": "specific next steps or follow-ups mentioned",
  "date": "{datetime.now().strftime('%Y-%m-%d')}"
}}
EXAMPLES:

"Phone call with Dr. Mehta and nurse Sarah"
→ {{"hcp_name": "Dr. Mehta", "attendees": "nurse Sarah", "interaction_type": "Phone Call"}}

"Met Dr. Patel alone about trial data"
→ {{"hcp_name": "Dr. Patel", "attendees": "", "interaction_type": "Meeting"}}
"Email to Dr. Sharma sharing brochure and samples"
→ {{"hcp_name": "Dr. Sharma", "attendees": "", "interaction_type": "Email", "materials_shared": "brochure", "samples_distributed": "some samples"}}
"""

    entities = None
    try:
        raw_response = llm.invoke(extract_prompt).content
        entities = _parse_llm_json(raw_response)
    except Exception as e:
        logger.warning(f"Step 1 extraction failed ({e}), using fallback.")

    if not entities:
        name_match = re.search(r'\bdr\.?\s+[a-z]+(?:\s+[a-z]+)?', raw_input, re.IGNORECASE)
        entities = {
            "hcp_name": name_match.group().title() if name_match else "Dr. Unknown",
            "interaction_type": "Meeting",
            "sentiment": "Neutral",
            "materials_shared": "",
            "samples_distributed": "",
            "outcomes": "",
            "follow_up_actions": "",
            "date": datetime.now().strftime("%Y-%m-%d"),
        }

    topics_prompt = f"""Read these field rep notes and extract ONLY the medical/clinical topics discussed.

NOTES: {raw_input}

Rules:
- Return 3 to 8 words MAXIMUM
- Focus on the drug, trial, or clinical topic (e.g. "Phase 3 statin trial results")
- Do NOT mention the doctor name or meeting type
- Do NOT return a full sentence or the original notes
- Return ONLY the short topic string, nothing else

Short topic summary:"""

    try:
        topics_raw = llm.invoke(topics_prompt).content.strip()
        topics_clean = topics_raw.split("\n")[0].strip().strip('"').strip("'")[:100]
        if len(topics_clean) > 80 or len(topics_clean.split()) > 12:
            raise ValueError(f"Topics still too long: {topics_clean[:60]}...")
        entities["topics_discussed"] = topics_clean
    except Exception as e:
        logger.warning(f"Step 2 topics failed ({e}), using keyword fallback.")
        keyword_match = re.search(
            r'(phase\s*\d+|trial|drug|efficacy|safety|statin|oncol\w+|cardio\w+|bp\s+drug|'
            r'clinical\s+data|new\s+\w+\s+drug|product\s+\w+)',
            raw_input, re.IGNORECASE
        )
        entities["topics_discussed"] = (
            keyword_match.group().title() if keyword_match else "Clinical discussion"
        )

    interaction_id = f"INT-{str(uuid.uuid4())[:8].upper()}"
    record = {
        "id": interaction_id,
        "hcp_name": entities.get("hcp_name", "Dr. Unknown"),
        "interaction_type": entities.get("interaction_type", "Meeting"),
        "date": entities.get("date", datetime.now().strftime("%Y-%m-%d")),
        "time": datetime.now().strftime("%H:%M"),
        "attendees": entities.get("attendees", ""),
        "topics_discussed": entities.get("topics_discussed", "Clinical discussion"),
        "materials_shared": entities.get("materials_shared", ""),
        "samples_distributed": entities.get("samples_distributed", ""),
        "sentiment": entities.get("sentiment", "Neutral"),
        "outcomes": entities.get("outcomes", ""),
        "follow_up_actions": entities.get("follow_up_actions", ""),
        "ai_suggested_follow_ups": [],
        "raw_chat_input": raw_input,
        "logged_by": "ai_agent",
    }

    async with AsyncSessionLocal() as session:
        saved_record = await save_interaction_db(record, session)

    return {
        "success": True,
        "interaction_id": interaction_id,
        "extracted": entities,
        "message": (
            f"✅ Logged interaction for {record['hcp_name']}!\n"
            f"Topics: {record['topics_discussed']}\n"
            f"Sentiment: {record['sentiment']}"
        ),
        "record": saved_record,
    }


@tool
async def edit_interaction(interaction_id: str, field: str, new_value: str) -> dict:
    """
    Updates a specific field of an existing interaction in PostgreSQL.
    field must be one of the allowed snake_case field names.
    """
    ALLOWED_FIELDS = {
        "hcp_name", "interaction_type", "topics_discussed", "sentiment",
        "materials_shared", "samples_distributed", "outcomes",
        "follow_up_actions", "date", "time", "attendees",
    }

    if field not in ALLOWED_FIELDS:
        return {
            "success": False,
            "error": f"Invalid field '{field}'. Allowed: {sorted(ALLOWED_FIELDS)}"
        }

    async with AsyncSessionLocal() as session:
        existing = await get_interaction_by_id_db(interaction_id, session)
        if not existing:
            return {
                "success": False,
                "error": f"Interaction {interaction_id} not found in database."
            }
        updated = await update_interaction_db(
            interaction_id, {field: new_value}, session
        )

    if not updated:
        return {"success": False, "error": f"Update failed for {interaction_id}"}

    return {
        "success": True,
        "interaction_id": interaction_id,
        "field": field,
        "new_value": new_value,
        "message": f"✅ Updated {field} to '{new_value}' for {interaction_id}",
        "record": updated,
    }


@tool
async def suggest_followups(
    hcp_name: str,
    topics_discussed: str,
    sentiment: str = "Neutral",
    outcomes: str = "",
    materials_shared: str = "",
) -> dict:
    """AI-generated follow-up suggestions based on interaction details."""
    llm = get_llm()
    
    prompt = f"""You are a pharmaceutical CRM assistant. Generate 3 specific, actionable follow-up suggestions for a field rep based on this HCP interaction:

HCP Name: {hcp_name}
Topics Discussed: {topics_discussed}
Sentiment: {sentiment}
Outcomes: {outcomes}
Materials Shared: {materials_shared}

Rules:
- Return ONLY a JSON array of exactly 3 strings
- Each suggestion must be specific to this interaction (mention the HCP name, drug, or topic)
- Be concise — max 15 words per suggestion
- No markdown, no explanation, just the JSON array

Example format:
["suggestion 1", "suggestion 2", "suggestion 3"]"""

    try:
        response = llm.invoke(prompt).content.strip()
        match = re.search(r'\[.*\]', response, re.DOTALL)
        if not match:
            raise ValueError("No JSON array found")
        suggestions = json.loads(match.group())
        if not isinstance(suggestions, list):
            raise ValueError("Not a list")
        suggestions = [s.strip() for s in suggestions[:3]]
    except Exception as e:
        logger.warning(f"AI suggest_followups failed ({e}), using fallback")
        suggestions = [
            f"Schedule follow-up with {hcp_name} in 2 weeks",
            f"Send resources on {topics_discussed} to {hcp_name}",
            "Log interaction in compliance system",
        ]

    return {"success": True, "suggestions": suggestions}
@tool
async def search_hcp(query: str) -> dict:
    """
    Dynamic HCP database search by name, specialty (oncologist→Oncology), 
    hospital, city, email, or phone. Returns full profiles with ranking.
    """
    async with AsyncSessionLocal() as session:
        from sqlalchemy import text
        
        stem_query = query.lower().replace('ologist', '').replace('logist', '')
        
        search_query = text("""
        SELECT id, name, specialty, hospital, city, email, phone 
        FROM hcps 
        WHERE LOWER(name) LIKE LOWER(:query)
           OR LOWER(specialty) LIKE LOWER(:query)
           OR LOWER(specialty) LIKE LOWER(:stem_query)
           OR LOWER(hospital) LIKE LOWER(:query)
           OR LOWER(city) LIKE LOWER(:query)
           OR LOWER(email) LIKE LOWER(:query) 
           OR LOWER(phone) LIKE LOWER(:query)
        ORDER BY name ASC
        LIMIT 10
        """)
        
        result = await session.execute(search_query, {
            "query": f"%{query}%",
            "stem_query": f"%{stem_query}%"
        })
        hcps = result.fetchall()
        
        matches = []
        for row in hcps:
            row_dict = dict(row._mapping)
            matches.append({
                "id": row_dict.get("id"),
                "name": row_dict.get("name", ""),
                "specialty": row_dict.get("specialty", ""),
                "hospital": row_dict.get("hospital", ""),
                "city": row_dict.get("city", ""),
                "email": row_dict.get("email", ""),
                "phone": row_dict.get("phone", "")
            })
    
    return {
        "success": True,
        "query": query,
        "count": len(matches),
        "message": f"Found {len(matches)} HCP(s) matching '{query}':",
        "results": matches
    }

@tool
async def get_interaction_history(hcp_name: str, limit: int = 5) -> dict:
    """
    Retrieves the last N interactions with a specific HCP from the database.
    Useful for pre-call planning and reviewing relationship history.
    """
    async with AsyncSessionLocal() as session:
        all_interactions = await get_interactions_db(session)
    matches = [
        i for i in all_interactions
        if hcp_name.lower() in i.get("hcp_name", "").lower()
    ]

    matches.sort(key=lambda x: x.get("date", ""), reverse=True)
    recent = matches[:limit]

    if not recent:
        return {
            "success": True,
            "hcp_name": hcp_name,
            "count": 0,
            "message": f"No past interactions found for {hcp_name}.",
            "interactions": [],
        }

    summary = [
        {
            "id": i.get("id"),
            "date": i.get("date"),
            "type": i.get("interaction_type"),
            "topics": i.get("topics_discussed"),
            "sentiment": i.get("sentiment"),
            "outcomes": i.get("outcomes"),
            "follow_up_actions": i.get("follow_up_actions"),
        }
        for i in recent
    ]

    return {
        "success": True,
        "hcp_name": hcp_name,
        "count": len(summary),
        "message": f"Found {len(summary)} past interaction(s) with {hcp_name}.",
        "interactions": summary,
    }

class AgentState(TypedDict):
    messages: Annotated[list, add_messages]


SYSTEM_PROMPT = """You are an HCP CRM assistant helping pharmaceutical field reps log and manage interactions with Healthcare Professionals (HCPs).
User: "[Ref: INT-AB12CD] Change sentiment to Negative"
→ edit_interaction("INT-AB12CD", "sentiment", "Negative")

User: "[Ref: INT-AB12CD] Add brochure to materials"
→ edit_interaction("INT-AB12CD", "materials_shared", "Brochure")

TOOLS AVAILABLE:
1. log_interaction_smart(raw_input)   — Log a new HCP interaction from messy notes
2. edit_interaction(id, field, value) — Edit a specific field of an existing interaction
3. suggest_followups(...)             — Get AI follow-up suggestions
4. search_hcp(query)                  — Search for HCPs by name/specialty
5. get_interaction_history(hcp_name, limit) — Retrieve past interactions with a specific HCP

RULES:
- For ANY new interaction log → call log_interaction_smart() with the full raw text
- For edits → call edit_interaction() with the exact interaction ID, field name, and new value
- field names for edit must be snake_case: hcp_name, interaction_type, topics_discussed, sentiment, outcomes, follow_up_actions
- Never ask for clarification if you can infer intent from context
- Always confirm what was logged/edited in your response
- For search_hcp results → always list each HCP name, hospital and city
- For get_interaction_history results → always summarize each interaction with date, type and sentiment

EXAMPLES:
User: "Log meeting with Dr Sharma about trial data, positive"
→ log_interaction_smart("meeting with Dr Sharma about trial data, positive")

User: "Change sentiment for INT-AB12CD to Negative"
→ edit_interaction("INT-AB12CD", "sentiment", "Negative")

User: "Update hcp name on INT-AB12CD to Dr. Priya Singh"
→ edit_interaction("INT-AB12CD", "hcp_name", "Dr. Priya Singh")
-----------------------------------
ACTIVE INTERACTION MEMORY (CRITICAL)
-----------------------------------

- If an interaction was just created or recently edited, treat it as the "active interaction"
- The user does NOT need to repeat the interaction ID
- If the user message does NOT include an ID:
  → assume they are referring to the active interaction

-----------------------------------
UPDATE VS CREATE DECISION (VERY IMPORTANT)
-----------------------------------

- If the user message modifies, adds, or continues previous information:
  → ALWAYS call edit_interaction()

- If the user clearly starts a completely new interaction with a different HCP:
  → call log_interaction_smart()

- If the message is ambiguous:
  → ALWAYS choose edit_interaction() (NOT create)

-----------------------------------
NO HALLUCINATION RULE
-----------------------------------

- NEVER invent:
  - HCP names
  - attendees
  - interaction type
  - dates
- ONLY use information explicitly mentioned by the user

-----------------------------------
FOLLOW-UP HANDLING
-----------------------------------

If the user says something like:
- "schedule follow up"
- "add note"
- "have to meet again"
- "follow up next week"

→ This is ALWAYS:
edit_interaction(<active_id>, "follow_up_actions", <user_text>)

-----------------------------------
IMPORTANT SAFETY RULE
-----------------------------------

- NEVER generate or guess an interaction ID like INT-XXXX
- ONLY use IDs that were explicitly provided or already exist in context
-----------------------------------
INTERACTION LIFECYCLE RULE (CRITICAL)
-----------------------------------

Once an interaction has been created using log_interaction_smart():

- That interaction becomes the ACTIVE interaction
- ALL subsequent user messages MUST be treated as updates to this interaction

DO NOT create a new interaction unless:
- The user explicitly says:
  - "log new interaction"
  - "create new interaction"
  - "new meeting with Dr X"
- OR a completely different HCP is clearly introduced

-----------------------------------
STRICT TOOL USAGE RULE
-----------------------------------

- After an interaction is created:
  → ONLY call edit_interaction() for all follow-up messages

- You are NOT allowed to call log_interaction_smart() again
  unless a new interaction is explicitly requested

-----------------------------------
NO NEW ID RULE
-----------------------------------

- NEVER generate or assume a new interaction ID
- NEVER switch to a new interaction automatically
- ALWAYS continue using the existing interaction

-----------------------------------
EXAMPLE FLOW
-----------------------------------

User: "Met Dr Sharma..."
→ log_interaction_smart()

User: "Change sentiment to positive"
→ edit_interaction(active_id, "sentiment", "Positive")

User: "Add outcome: patient responded well"
→ edit_interaction(active_id, "outcomes", "patient responded well")

User: "Schedule follow up next week"
→ edit_interaction(active_id, "follow_up_actions", "Schedule follow up next week")

-----------------------------------
FAIL-SAFE RULE
-----------------------------------

If there is ANY doubt:
→ ALWAYS call edit_interaction()
→ NEVER create a new interaction
"""

ALL_TOOLS = [
    log_interaction_smart,
    edit_interaction,
    suggest_followups,
    search_hcp,
    get_interaction_history,
]


def agent_node(state: AgentState):
    llm = get_llm().bind_tools(ALL_TOOLS)
    messages = [SystemMessage(content=SYSTEM_PROMPT)] + state["messages"]
    response = llm.invoke(messages)
    return {"messages": [response]}


def should_continue(state: AgentState):
    last = state["messages"][-1]
    if hasattr(last, "tool_calls") and last.tool_calls:
        return "tools"
    return END

graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", ToolNode(ALL_TOOLS))
graph.set_entry_point("agent")
graph.add_conditional_edges("agent", should_continue)
graph.add_edge("tools", "agent")
hcp_agent = graph.compile()

async def run_agent(user_message: str, history: list = []) -> dict:
    messages = [HumanMessage(content=user_message)]
    
    try:
        result = await hcp_agent.ainvoke({"messages": messages})
    except Exception as e:
        logger.error(f"[run_agent] invoke failed: {e}")
        return {
            "message": "Sorry, the AI encountered an error. Please try again.",
            "extracted_data": None,
            "tool_used": None,
        }

    final_msg = result["messages"][-1].content
    extracted_data = None
    tool_used = None

    for msg in reversed(result["messages"]):
        if isinstance(msg, ToolMessage):
            tool_used = getattr(msg, "name", None)
            try:
                if isinstance(msg.content, dict):
                    content = msg.content
                else:
                    raw_str = str(msg.content)
                    try:
                        content = json.loads(raw_str)
                    except Exception:
                        fixed = re.sub(r'datetime\.datetime\([^)]+\)', '"datetime"', raw_str)
                        fixed = (fixed
                            .replace("'", '"')
                            .replace("True", "true")
                            .replace("False", "false")
                            .replace("None", "null")
                        )
                        content = json.loads(fixed)

                if isinstance(content, dict) and content.get("success"):
                    raw = (
                        content.get("extracted")
                        or content.get("record")
                        or (content if content.get("interactions") is not None else None)
                        or (content if content.get("results") is not None else None)
                        or (content if content.get("suggestions") is not None else None)
                    )
                    if raw:
                        extracted_data = json.loads(json.dumps(raw, default=str))
                        break
            except Exception as e:
                logger.warning(f"[run_agent] Failed: {e}")

    return {
        "message": final_msg,
        "extracted_data": extracted_data,
        "tool_used": tool_used,
    }