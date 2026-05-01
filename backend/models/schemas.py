"""Pydantic v2 schemas for request/response validation."""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class InteractionCreate(BaseModel):
    id: Optional[str] = None
    hcpName: str = Field(..., min_length=1)
    interactionType: str = "Meeting"
    date: str = ""
    time: str = ""
    attendees: str = ""
    topicsDiscussed: str = ""
    materialsShared: List[str] = []
    samplesDistributed: List[str] = []
    sentiment: str = "Neutral"
    outcomes: str = ""
    followUpActions: str = ""
    aiSuggestedFollowUps: List[str] = []
    rawChatInput: Optional[str] = ""


class InteractionUpdate(BaseModel):
    hcpName: Optional[str] = None
    interactionType: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    attendees: Optional[str] = None
    topicsDiscussed: Optional[str] = None
    materialsShared: Optional[List[str]] = None
    samplesDistributed: Optional[List[str]] = None
    sentiment: Optional[str] = None
    outcomes: Optional[str] = None
    followUpActions: Optional[str] = None
    aiSuggestedFollowUps: Optional[List[str]] = None


class InteractionResponse(BaseModel):
    id: str
    hcpName: str
    interactionType: str
    date: str
    time: str
    attendees: str
    topicsDiscussed: str
    materialsShared: List[str]
    samplesDistributed: List[str]
    sentiment: str
    outcomes: str
    followUpActions: str
    aiSuggestedFollowUps: List[str]
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    message: str
    history: List[dict] = []


class ChatResponse(BaseModel):
    message: str
    extracted_data: Optional[dict] = None
    tool_used: Optional[str] = None


class SuggestFollowUpsRequest(BaseModel):
    hcpName: str = ""
    topicsDiscussed: str = ""
    outcomes: str = ""
    sentiment: str = "Neutral"
    materialsShared: List[str] = []


class SuggestFollowUpsResponse(BaseModel):
    suggestions: List[str]


class HCPSearchResponse(BaseModel):
    id: str
    name: str
    specialty: str
    hospital: str
    city: str
