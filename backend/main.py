"""
HCP CRM Backend — FastAPI Application
Entry point: uvicorn main:app --reload
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from routers.routes import interactions_router, agent_router, hcp_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("🚀 HCP CRM API starting up...")
    from db.database import init_db
    await init_db()
    logger.info("✅ Ready — LangGraph agent initialized")
    yield
    logger.info("🛑 HCP CRM API shutting down")


app = FastAPI(
    title="HCP CRM API",
    description="AI-First CRM for Healthcare Professional interaction management",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(interactions_router)
app.include_router(agent_router)
app.include_router(hcp_router)


@app.get("/")
async def root():
    return {
        "status": "running",
        "service": "HCP CRM API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "healthy", "agent": "LangGraph (gemma2-9b-it via Groq)"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
