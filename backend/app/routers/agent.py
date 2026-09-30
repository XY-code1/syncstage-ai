"""Agent 接口：自然语言需求 -> 工具编排 -> 匹配结果 -> 双向确认 -> 临时房间。"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.agent import orchestrator as orch
from app.agent.schemas import (
    AgentRunRequest,
    FeedbackRequest,
    IntentParseRequest,
    InviteRequest,
    PeerConfirmRequest,
)
from app.agent.social import load_social_profile
from app.agent.state import AgentState, ParsedIntent
from app.agent.tools import PIPELINE, TOOLS, ToolContext
from app.config import settings

router = APIRouter(prefix='/api/agent', tags=['agent'])


def _session_or_404(session_id: str) -> AgentState:
    state = orch.get_session(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail='这个 Agent 会话不存在或已过期，请重新开始')
    return state


@router.get('/provider')
def read_provider() -> dict:
    """数据源说明：当前一定是脱敏 Demo 数据，官方 API 尚未接入。"""

    provider = orch.get_orchestrator().provider
    return {
        **provider.describe(),
        'tmeProvider': settings.tme_provider,
        'aiEnabled': settings.ai_enabled,
        'aiFallbackReason': settings.ai_fallback_reason,
    }


@router.get('/tools')
def read_tools() -> dict:
    """Agent 可以调用的工具清单（评委模式展示）。"""

    return {
        'items': [
            {
                'name': spec.name,
                'label': spec.label,
                'description': spec.description,
                'phase': spec.phase,
            }
            for spec in TOOLS.values()
        ],
        'pipeline': list(PIPELINE),
    }


@router.post('/intent/parse')
async def parse_intent(payload: IntentParseRequest) -> dict:
    """只做第一步：把自然语言需求解析成结构化意图，交给用户确认。"""

    agent = orch.get_orchestrator()
    state = AgentState(
        session_id='parse-' + orch.new_session_id()[:12],
        user_id=payload.userId,
        event_id=payload.eventId,
        raw_intent=payload.text,
        authorized_scopes=list(payload.authorizedScopes),
        status='collecting_intent',
    )
    ctx = ToolContext(provider=agent.provider, state=state)
    social = load_social_profile(payload.userId)
    result = await agent.call_tool(
        ctx,
        'parse_social_intent',
        text=payload.text,
        event_id=payload.eventId,
        viewer_gender=social.gender if social else 'prefer-not-to-say',
        force_fallback=payload.forceFallback,
    )
    return {
        'parsedIntent': result.payload.to_dict() if result.payload else None,
        'trace': [item.to_dict() for item in state.trace],
        'usedFallback': result.used_fallback,
        'provider': agent.provider.describe(),
    }


@router.post('/sessions')
async def start_session(payload: AgentRunRequest) -> dict:
    """跑完整条 Agent 流水线，返回带证据的匹配结果与执行轨迹。"""

    agent = orch.get_orchestrator()
    override: ParsedIntent | None = None
    if payload.parsedIntent:
        override = ParsedIntent.from_dict(payload.parsedIntent)

    state = await agent.start(
        session_id=orch.new_session_id(),
        user_id=payload.userId,
        event_id=payload.eventId,
        raw_intent=payload.text,
        authorized_scopes=payload.authorizedScopes,
        demo_case=payload.demoCase,
        intent_override=override,
    )
    return state.to_dict()


@router.get('/sessions/{session_id}')
def read_session(session_id: str) -> dict:
    return _session_or_404(session_id).to_dict()


@router.post('/sessions/{session_id}/destroy')
def destroy_session(session_id: str) -> dict:
    if not orch.get_orchestrator().destroy(session_id):
        raise HTTPException(status_code=404, detail='这个 Agent 会话不存在或已销毁')
    return {'destroyed': True, 'sessionId': session_id}


@router.post('/sessions/{session_id}/invite')
async def invite(session_id: str, payload: InviteRequest) -> dict:
    """发起方确认邀请对象：进入 pending_confirmation，此时还不能建房间。"""

    try:
        state = await orch.get_orchestrator().invite(session_id, payload.candidateId)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return state.to_dict()


@router.post('/sessions/{session_id}/peer-confirm')
async def peer_confirm(session_id: str, payload: PeerConfirmRequest) -> dict:
    """Demo：模拟受邀方在自己的客户端上确认。双方都确认后才允许创建房间。"""

    try:
        state = await orch.get_orchestrator().peer_confirm(session_id, payload.accept)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return state.to_dict()


@router.post('/sessions/{session_id}/room')
async def create_room(session_id: str) -> dict:
    """双方确认后才创建临时房间；未确认时返回 409。"""

    try:
        state = await orch.get_orchestrator().create_room(session_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error

    if not state.room_id:
        raise HTTPException(status_code=409, detail='双方尚未都确认，不能创建临时房间')
    return state.to_dict()


@router.post('/sessions/{session_id}/feedback')
async def feedback(session_id: str, payload: FeedbackRequest) -> dict:
    try:
        state = await orch.get_orchestrator().feedback(session_id, payload.rating, payload.tags, payload.comment)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return state.to_dict()
