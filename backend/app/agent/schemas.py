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


class InvitationRespondRequest(BaseModel):
    """对方视角的确认入口：只凭 inviteId 接受或拒绝，不需要知道发起方会话。"""

    accept: bool = True


class FeedbackRequest(BaseModel):
    rating: str = 'ok'
    tags: list[str] = Field(default_factory=list)
    comment: str = ''


class ChatTurn(BaseModel):
    """会话历史里的单条消息（只保留用户与 Agent 两种角色）。"""

    role: str = 'user'
    content: str = ''


class ChatRequest(BaseModel):
    """ChatRoom 的对话请求：前端把会话历史与真实上下文一起带上。"""

    threadId: str = ''
    threadKind: str = 'agent'
    concertId: str = 'night-flight'
    roomId: str | None = None
    peerName: str | None = None
    userId: str = 'u-viewer'
    messages: list[ChatTurn] = Field(default_factory=list)