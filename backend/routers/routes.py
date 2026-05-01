"""
FastAPI routers for:
  - /api/interactions   (CRUD for HCP interactions)
  - /api/agent          (LangGraph agent endpoints)
  - /api/hcp            (HCP search)
"""
import logging
from agent.hcp_agent import get_interaction_history
from fastapi import APIRouter, HTTPException
from typing import List
import uuid
from datetime import datetime
from sqlalchemy import delete as sql_delete, select

from db.database import (
    AsyncSessionLocal, save_interaction_db, get_interactions_db,
    get_interaction_by_id_db, update_interaction_db, search_hcp_db,
    HCPInteraction, HCP
)
from models.schemas import (
    InteractionCreate, InteractionUpdate, InteractionResponse,
    ChatRequest, ChatResponse,
    SuggestFollowUpsRequest, SuggestFollowUpsResponse,
)
from agent.hcp_agent import run_agent, suggest_followups, search_hcp
logger = logging.getLogger(__name__)
interactions_router = APIRouter(prefix="/api/interactions", tags=["interactions"])


@interactions_router.get("")
async def get_all_interactions():
    async with AsyncSessionLocal() as session:
        return await get_interactions_db(session)


@interactions_router.get("/{interaction_id}")
async def get_interaction(interaction_id: str):
    async with AsyncSessionLocal() as session:
        interaction = await get_interaction_by_id_db(interaction_id, session)
        if not interaction:
            raise HTTPException(404, "Not found")
        return interaction


@interactions_router.post("", response_model=dict, status_code=201)
async def create_interaction(data: InteractionCreate):
    """Log a new HCP interaction via the structured form."""
    interaction_id = f"INT-{str(uuid.uuid4())[:8].upper()}"
    record = {
        "id": interaction_id,
        "hcp_name": data.hcpName,
        "interaction_type": data.interactionType,
        "date": data.date,
        "time": data.time,
        "attendees": data.attendees or "",
        "topics_discussed": data.topicsDiscussed or "",
        "materials_shared": data.materialsShared or [],
        "samples_distributed": data.samplesDistributed or [],
        "sentiment": data.sentiment or "Neutral",
        "outcomes": data.outcomes or "",
        "follow_up_actions": data.followUpActions or "",
        "ai_suggested_follow_ups": data.aiSuggestedFollowUps or [],
        "raw_chat_input": data.rawChatInput or "",
        "logged_by": "field_rep",
    }
    async with AsyncSessionLocal() as session:
        saved = await save_interaction_db(record, session)
    return {"success": True, "interaction_id": interaction_id, "record": saved}


@interactions_router.put("/{interaction_id}", response_model=dict)
async def update_interaction(interaction_id: str, data: InteractionUpdate):
    """Update an existing interaction record."""
    update_dict = data.model_dump(exclude_none=True)

    field_map = {
        "hcpName": "hcp_name",
        "interactionType": "interaction_type",
        "topicsDiscussed": "topics_discussed",
        "materialsShared": "materials_shared",
        "samplesDistributed": "samples_distributed",
        "followUpActions": "follow_up_actions",
        "aiSuggestedFollowUps": "ai_suggested_follow_ups",
    }
    normalized = {}
    for key, value in update_dict.items():
        db_key = field_map.get(key, key)
        normalized[db_key] = value

    async with AsyncSessionLocal() as session:
        updated = await update_interaction_db(interaction_id, normalized, session)
        if not updated:
            raise HTTPException(
                status_code=404,
                detail=f"Interaction {interaction_id} not found"
            )
    return {"success": True, "record": updated}


@interactions_router.delete("/{interaction_id}")
async def delete_interaction(interaction_id: str):
    """Delete an interaction record."""
    async with AsyncSessionLocal() as session:
        interaction = await get_interaction_by_id_db(interaction_id, session)
        if not interaction:
            raise HTTPException(status_code=404, detail="Interaction not found")
        await session.execute(
            sql_delete(HCPInteraction).where(HCPInteraction.id == interaction_id)
        )
        await session.commit()
    return {"success": True, "message": f"Interaction {interaction_id} deleted"}

agent_router = APIRouter(prefix="/api/agent", tags=["agent"])


@agent_router.post("/chat", response_model=ChatResponse)
async def chat_with_agent(request: ChatRequest):
    try:
        result = await run_agent(request.message, request.history or [])
        return ChatResponse(
            message=result.get("message", ""),
            extracted_data=result.get("extracted_data"),
            tool_used=result.get("tool_used"),
        )
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Agent error: {str(e)}")


@agent_router.post("/log", response_model=dict)
async def log_via_agent(body: dict):
    """
    Log an interaction from natural language text.
    Accepts EITHER { text } OR { message } for compatibility.
    """
    text = body.get("text") or body.get("message", "")
    if not text:
        raise HTTPException(status_code=400, detail="text or message field is required")
    result = await run_agent(f"Please log this HCP interaction: {text}")
    return result


@agent_router.post("/suggest-followups", response_model=SuggestFollowUpsResponse)
async def get_follow_up_suggestions(data: SuggestFollowUpsRequest):
    """
    Get AI-generated follow-up suggestions for an interaction.
    """
    result = await suggest_followups.ainvoke({
        "hcp_name": data.hcpName,
        "topics_discussed": data.topicsDiscussed,
        "sentiment": data.sentiment,
        "outcomes": data.outcomes,
        "materials_shared": ", ".join(data.materialsShared),
    })
    return SuggestFollowUpsResponse(suggestions=result.get("suggestions", []))
hcp_router = APIRouter(prefix="/api/hcp", tags=["hcp"])


@hcp_router.get("/search", response_model=List[dict])
async def search_hcp_endpoint(q: str = ""):
    """Search HCPs by name, specialty, hospital, or city."""
    if not q:
        async with AsyncSessionLocal() as session:
            return await search_hcp_db("", session)
    result = await search_hcp.ainvoke({"query": q})
    return result.get("results", [])


@hcp_router.get("/{hcp_id}", response_model=dict)
async def get_hcp(hcp_id: str):
    """Get a single HCP profile."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(HCP).where(HCP.id == hcp_id))
        hcp = result.scalar_one_or_none()
        if not hcp:
            raise HTTPException(status_code=404, detail="HCP not found")
        return hcp.__dict__
    
@hcp_router.get("/history/{hcp_name}", response_model=dict)
async def get_hcp_history(hcp_name: str, limit: int = 5):
    """Fetch past interactions for a specific HCP."""
    result = await get_interaction_history.ainvoke({
        "hcp_name": hcp_name,
        "limit": limit,
    })
    return result