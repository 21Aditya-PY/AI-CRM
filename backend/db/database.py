"""
Database configuration and SQLAlchemy models for HCP CRM.
Uses PostgreSQL via asyncpg.
"""
import os
from datetime import datetime
from sqlalchemy import Column, String, Text, DateTime, JSON, select, delete
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:password@localhost:5432/hcp_crm"
)

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

Base = declarative_base()


class HCPInteraction(Base):
    """Stores all logged HCP interactions."""
    __tablename__ = "hcp_interactions"

    id                      = Column(String(64), primary_key=True)
    hcp_name                = Column(String(255), nullable=False, index=True)
    interaction_type        = Column(String(64), default="Meeting")
    date                    = Column(String(16))       
    time                    = Column(String(8))        
    attendees               = Column(Text, default="")
    topics_discussed        = Column(Text, default="")
    materials_shared        = Column(JSON, default=list)
    samples_distributed     = Column(JSON, default=list)
    sentiment               = Column(String(16), default="Neutral")
    outcomes                = Column(Text, default="")
    follow_up_actions       = Column(Text, default="")
    ai_suggested_follow_ups = Column(JSON, default=list)
    created_at              = Column(DateTime, default=datetime.utcnow)
    updated_at              = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    logged_by               = Column(String(128), default="field_rep")
    raw_chat_input          = Column(Text, default="")


class HCP(Base):
    """Master HCP list."""
    __tablename__ = "hcps"

    id         = Column(String(64), primary_key=True)
    name       = Column(String(255), nullable=False, index=True)
    specialty  = Column(String(128), default="")
    hospital   = Column(String(255), default="")
    city       = Column(String(128), default="")
    email      = Column(String(255), default="")
    phone      = Column(String(32), default="")
    created_at = Column(DateTime, default=datetime.utcnow)

async def get_db():
    """Dependency: yield async DB session."""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    """Create tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def _row_to_dict(obj) -> dict:
    result = {}
    for k, v in obj.__dict__.items():
        if k.startswith("_"):
            continue
        if isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


async def save_interaction_db(interaction_data: dict, session: AsyncSession) -> dict:
    """Save a new HCP interaction to PostgreSQL and return the saved record."""
    clean_data = {k: v for k, v in interaction_data.items() if not k.startswith("_")}
    db_interaction = HCPInteraction(**clean_data)
    session.add(db_interaction)
    await session.commit()
    await session.refresh(db_interaction)
    return _row_to_dict(db_interaction)


async def get_interactions_db(session: AsyncSession, limit: int = 100) -> list:
    """Fetch recent interactions from DB, newest first."""
    result = await session.execute(
        select(HCPInteraction)
        .order_by(HCPInteraction.created_at.desc())
        .limit(limit)
    )
    return [_row_to_dict(row) for row in result.scalars().all()]


async def get_interaction_by_id_db(interaction_id: str, session: AsyncSession) -> dict | None:
    """Get a single interaction by its ID. Returns None if not found."""
    result = await session.execute(
        select(HCPInteraction).where(HCPInteraction.id == interaction_id)
    )
    interaction = result.scalar_one_or_none()
    return _row_to_dict(interaction) if interaction else None


async def update_interaction_db(
    interaction_id: str,
    updates: dict,
    session: AsyncSession
) -> dict | None:
    """
    Update specified fields of an interaction.
    Returns the updated record dict, or None if not found.
    """
    result = await session.execute(
        select(HCPInteraction).where(HCPInteraction.id == interaction_id)
    )
    interaction = result.scalar_one_or_none()
    if not interaction:
        return None

    for key, value in updates.items():
        if hasattr(interaction, key):
            setattr(interaction, key, value)

    interaction.updated_at = datetime.utcnow()
    await session.commit()
    await session.refresh(interaction)
    return _row_to_dict(interaction)


async def delete_interaction_db(interaction_id: str, session: AsyncSession) -> bool:
    """Delete an interaction by ID. Returns True if deleted, False if not found."""
    result = await session.execute(
        select(HCPInteraction).where(HCPInteraction.id == interaction_id)
    )
    interaction = result.scalar_one_or_none()
    if not interaction:
        return False
    await session.execute(
        delete(HCPInteraction).where(HCPInteraction.id == interaction_id)
    )
    await session.commit()
    return True


async def search_hcp_db(query: str, session: AsyncSession) -> list:
    """
    Search HCPs by name, specialty, hospital, or city.
    Returns up to 10 matches.
    """
    if not query:
        result = await session.execute(select(HCP).limit(10))
        return [_row_to_dict(row) for row in result.scalars().all()]

    from sqlalchemy import or_, func
    q = f"%{query.lower()}%"
    result = await session.execute(
        select(HCP).where(
            or_(
                func.lower(HCP.name).like(q),
                func.lower(HCP.specialty).like(q),
                func.lower(HCP.hospital).like(q),
                func.lower(HCP.city).like(q),
            )
        ).limit(10)
    )
    return [_row_to_dict(row) for row in result.scalars().all()]