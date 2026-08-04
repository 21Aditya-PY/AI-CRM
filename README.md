# HCP CRM — AI-First Healthcare Professional Interaction Logger

An AI-powered CRM module for pharmaceutical field representatives to log HCP (Healthcare Professional) interactions via a structured form **or** a conversational AI chat interface.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Redux Toolkit |
| **Backend** | Python 3.11 + FastAPI |
| **AI Agent** | LangGraph |
| **LLM** | Groq — `gemma2-9b-it` (+ `llama-3.3-70b-versatile`) |
| **Database** | PostgreSQL (via SQLAlchemy async) |
| **Font** | Google Inter + DM Mono |

---

## Features

### Log Interaction Screen
- **Dual-mode input**: Structured form OR natural language AI chat
- **AI entity extraction**: Describe a meeting in plain text — the agent extracts HCP name, interaction type, sentiment, materials, samples, outcomes automatically
- **AI follow-up suggestions**: One-click AI-generated follow-up recommendations
- **Voice note summarization**: Placeholder for speech-to-text integration
- **Edit mode**: Load any saved interaction for editing

### LangGraph Agent — 5 Tools

| # | Tool | Description |
|---|---|---|
| 1 | `log_interaction` | Parses natural language, extracts entities via LLM, saves to DB |
| 2 | `edit_interaction` | Modifies specific fields of an existing logged interaction |
| 3 | `suggest_followups` | Generates AI follow-up actions based on sentiment, topics, materials |
| 4 | `search_hcp` | Looks up HCP profiles and recent interaction history |
| 5 | `get_interaction_history` | Provides recent interaction history with an HCP to support pre-call planning. |

---

## Project Structure

```
hcp-crm/
├── src/                        # React frontend
│   ├── components/
│   │   ├── TopNav.jsx          # Navigation bar
│   │   ├── InteractionForm.jsx # Structured form
│   │   ├── ChatPanel.jsx       # AI chat interface
│   │   ├── SavedInteractions.jsx
│   │   └── Toast.jsx
│   ├── store/
│   │   ├── index.js            # Redux store
│   │   └── interactionSlice.js # Redux slice
│   ├── services/
│   │   └── api.js              # Axios API layer
│   └── styles/
│       └── global.css
│
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── requirements.txt
│   ├── .env.example
│   ├── agent/
│   │   └── hcp_agent.py        # LangGraph agent + all 5 tools
│   ├── routers/
│   │   └── routes.py           # API endpoints
│   ├── models/
│   │   └── schemas.py          # Pydantic schemas
│   └── db/
│       └── database.py         # SQLAlchemy models + connection
│
└── README.md
```

---

## Setup & Running

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL 15+

### 1. Get a Groq API Key
1. Visit [https://console.groq.com](https://console.groq.com)
2. Sign up and create a new API key
3. Copy the key

### 2. Frontend Setup
```bash
# From root directory
npm install
npm start
# Runs at http://localhost:3000
```

### 3. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — add your GROQ_API_KEY and DATABASE_URL

# Start the API server
uvicorn main:app --reload --port 8000
# Runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### 4. PostgreSQL Setup (Optional for full persistence)
```sql
CREATE DATABASE hcp_crm;
CREATE USER postgres WITH PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE hcp_crm TO postgres;
```
Then set `DATABASE_URL` in `.env` and uncomment `init_db()` in `main.py`.

> **Note:** The app works without a database — interactions are stored in memory for demo purposes.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/interactions` | Retrieve all logged interactions |
| `GET` | `/api/interactions/{interaction_id}` | Get a specific interaction by ID |
| `POST` | `/api/interactions` | Log a structured interaction |
| `PUT` | `/api/interactions/{interaction_id}` | Update an existing interaction |
| `DELETE` | `/api/interactions/{interaction_id}` | Delete an interaction |

| `POST` | `/api/agent/chat` | Chat with the LangGraph AI agent |
| `POST` | `/api/agent/log` | Log interaction via natural language input |
| `POST` | `/api/agent/suggest-followups` | Generate AI follow-up suggestions |

| `GET` | `/api/hcp/search?q=` | Search HCPs by name, specialty, or location |
| `GET` | `/api/hcp/{hcp_id}` | Get HCP profile details |
| `GET` | `/api/hcp/history/{hcp_name}` | Get recent interaction history for an HCP |

---

## How the LangGraph Agent Works

```
User message
     ↓
[Agent Node] — LLM (llama-3.1-8b-instant) reasons about intent
     ↓
[Tool Selection] — Picks the right tool from 5 available
     ↓
[Tool Execution] — Runs the tool (log, edit, suggest, search, recent interaction)
     ↓
[Agent Node] — LLM summarizes result for the user
     ↓
Response with extracted_data (pre-fills the form)
```
