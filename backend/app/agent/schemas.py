"""Agent 接口的请求 / 响应模型。"""

from __future__ import annotations

from pydantic import BaseModel, Field


class IntentParseRequest(BaseModel):
    text: str = ''
    eventId: str = 'night-flight'
    userId: str = 'u-viewer'
    authorizedScopes: list[str] = Field(default_factory=list)
    forceFallback: bool = False


class AgentRunRequest(BaseModel):
    eventId: str = 'night-flight'
    userId: str = 'u-viewer'
    text: str = ''
    authorizedScopes: list[str] = Field(default_factory=list)
    parsedIntent: dict | None = None
    demoCase: str = 'normal'


class InviteRequest(BaseModel):
    candidateId: str


class PeerConfirmRequest(BaseModel):
    accept: bool = True


class FeedbackRequest(BaseModel):
    rating: str = 'ok'
    tags: list[str] = Field(default_factory=list)
    comment: str = ''