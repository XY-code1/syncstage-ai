"""Agent 编排器：按固定顺序调用工具，记录可核验的执行轨迹。

执行规则：
1. 先解析自然语言需求，再读取授权音乐画像与演出上下文；
2. 检索同场候选人 -> 执行安全硬约束 -> 排序 -> 组队 -> 生成有证据的理由；
3. 找不到合适对象时返回 no_match，绝不编造候选人；
4. 创建房间、共享集合点、保留联系之前必须进入 pending_confirmation；
5. 只有双方都确认后才允许调用 create_temporary_room；
6. 大模型不可用时使用本地规则解析与文案模板 fallback。
"""

from __future__ import annotations

import inspect
import threading
import time
import uuid
from typing import Any

from app.agent.scoring import CandidateFacts, build_facts
from app.agent.social import SocialProfile, load_social_profile
from app.agent.state import AgentState, ParsedIntent, ToolTraceRecord
from app.agent.tools import PIPELINE, TOOLS, ToolContext, ToolResult
from app.integrations.base import TMEDataProvider, get_tme_provider

SESSION_TTL_SECONDS = 60 * 60 * 6

# 评委演示模式的三个案例
DEMO_CASES = ('normal', 'safety_no_match', 'ai_fallback')


class AgentOrchestrator:
    def __init__(self, provider: TMEDataProvider | None = None) -> None:
        self.provider = provider or get_tme_provider()
        self._sessions: dict[str, AgentState] = {}
        self._lock = threading.Lock()

    # ---------------------------------------------------------------- 会话
    def get_session(self, session_id: str) -> AgentState | None:
        return self._sessions.get(session_id)

    def store(self, state: AgentState) -> None:
        with self._lock:
            self._sessions[state.session_id] = state

    def destroy(self, session_id: str) -> bool:
        """销毁一场演出对应的临时 Agent 及其全部内存数据。"""
        with self._lock:
            return self._sessions.pop(session_id, None) is not None

    def _gc(self) -> None:
        now = time.time()
        stale = [key for key, value in self._sessions.items() if now - value.updated_at > SESSION_TTL_SECONDS]
        for key in stale:
            self._sessions.pop(key, None)

    # ---------------------------------------------------------------- 工具调用
    async def call_tool(self, ctx: ToolContext, name: str, **kwargs: Any) -> ToolResult:
        spec = TOOLS[name]
        started = time.perf_counter()
        try:
            result = spec.run(ctx, **kwargs)
            if inspect.isawaitable(result):
                result = await result
        except Exception as error:  # noqa: BLE001 - 任何工具异常都要变成显式错误状态
            elapsed = int((time.perf_counter() - started) * 1000)
            ctx.state.add_trace(
                ToolTraceRecord(
                    name=name,
                    label=spec.label,
                    phase=spec.phase,
                    status='error',
                    input_summary=_shorten(kwargs),
                    output_summary='工具执行失败',
                    duration_ms=elapsed,
                    error=type(error).__name__ + ': ' + str(error)[:160],
                )
            )
            ctx.state.status = 'error'
            ctx.state.error = '工具 ' + name + ' 执行失败：' + str(error)[:120]
            raise

        elapsed = int((time.perf_counter() - started) * 1000)
        ctx.state.add_trace(
            ToolTraceRecord(
                name=name,
                label=spec.label,
                phase=spec.phase,
                status=result.status,
                input_summary=result.input_summary,
                output_summary=result.output_summary,
                duration_ms=elapsed,
                used_fallback=result.used_fallback,
                error='' if result.status != 'error' else result.output_summary,
            )
        )
        return result

    # ---------------------------------------------------------------- 主流程
    async def start(
        self,
        *,
        session_id: str,
        user_id: str,
        event_id: str,
        raw_intent: str,
        authorized_scopes: list[str] | None = None,
        demo_case: str = 'normal',
        intent_override: ParsedIntent | None = None,
    ) -> AgentState:
        """跑完整条流水线，直到 pending_confirmation（或 no_match / error）。"""

        self._gc()
        now = time.time()
        state = AgentState(
            session_id=session_id,
            user_id=user_id,
            event_id=event_id,
            raw_intent=raw_intent,
            authorized_scopes=list(authorized_scopes or []),
            scenario=demo_case if demo_case in DEMO_CASES else 'normal',
            status='running',
            created_at=now,
            updated_at=now,
        )
        state.provider_info = self.provider.describe()
        ctx = ToolContext(provider=self.provider, state=state)

        viewer_social: SocialProfile = load_social_profile(user_id) or SocialProfile(
            user_id=user_id, display_name='你', city='', gender='undisclosed'
        )

        try:
            await self._run_pipeline(ctx, viewer_social, event_id, raw_intent, demo_case, intent_override)
        except Exception as error:  # noqa: BLE001
            state.status = 'error'
            state.error = state.error or ('Agent 执行失败：' + str(error)[:120])

        state.updated_at = time.time()
        self.store(state)
        return state

    async def _run_pipeline(
        self,
        ctx: ToolContext,
        viewer_social: SocialProfile,
        event_id: str,
        raw_intent: str,
        demo_case: str,
        intent_override: ParsedIntent | None = None,
    ) -> None:
        state = ctx.state

        # 1. 理解意图
        parse_result = await self.call_tool(
            ctx,
            'parse_social_intent',
            text=raw_intent,
            event_id=event_id,
            viewer_gender=viewer_social.gender,
            force_fallback=demo_case == 'ai_fallback',
            override=intent_override.to_dict() if intent_override else None,
        )
        intent = parse_result.payload
        if intent is None:
            state.status = 'error'
            state.error = '没能理解你的需求，请换一种说法'
            return

        # 2. 读取授权音乐画像
        await self.call_tool(
            ctx,
            'get_authorized_music_profile',
            user_id=viewer_social.user_id,
            scopes=state.authorized_scopes or None,
        )
        if state.music_profile is None:
            state.status = 'error'
            state.error = '没有读取到你的音乐画像，请重新授权'
            return

        # 3. 读取演出上下文
        event_result = await self.call_tool(ctx, 'get_event_context', event_id=event_id)
        if event_result.payload is None:
            state.status = 'error'
            state.error = '没有找到这场演出'
            return

        if demo_case == 'safety_no_match':
            intent.same_gender_only = True
            intent.meet_in_person = True
            intent.group_size = 2
            intent.strict = True
            intent.purposes = intent.purposes or ['安静听完整场']
            ctx.state.parsed_intent = intent

        viewer = build_facts(state.music_profile, viewer_social)

        # 4. 检索同场候选人
        search_result = await self.call_tool(ctx, 'search_same_event_candidates', event_id=event_id)
        candidates: list[CandidateFacts] = search_result.payload or []

        # 5. 安全硬约束
        safety_result = await self.call_tool(
            ctx,
            'apply_safety_constraints',
            viewer=viewer,
            viewer_social=viewer_social,
            intent=intent,
            candidates=candidates,
        )
        kept: list[CandidateFacts] = (safety_result.payload or {}).get('kept', [])

        if not kept:
            state.status = 'no_match'
            state.proposed_group = {}
            state.pending_confirmation = {
                'required': False,
                'status': 'blocked',
                'reason': '所有同场候选人都被硬条件排除了，包括性别、年龄段、见面意愿等安全要求',
                'nextAction': 'relax',
            }
            state.updated_at = time.time()
            return

        # 6. 排序
        rank_result = await self.call_tool(ctx, 'rank_candidates', viewer=viewer, intent=intent, candidates=kept)
        ranked = rank_result.payload or []

        # Agent-to-Agent 只交换匿名结构字段，禁止自由聊天与个人敏感数据。
        for tool_name in (
            'verify_same_event', 'compare_arrival_plan', 'compare_music_profile', 'compare_social_intent',
            'negotiate_group_size', 'verify_safety_constraints', 'identify_conflicts', 'generate_handshake_report',
        ):
            await self.call_tool(ctx, tool_name, candidate_count=len(ranked))
        state.handshake_reports = {
            item['userId']: {
                'candidateId': item['userId'],
                'agreements': ['已核验为同一场演出'] + ([f"共同歌曲：{'、'.join(item.get('sharedSongs', [])[:2])}"] if item.get('sharedSongs') else []),
                'conflicts': list(item.get('differences') or []),
                'needsHumanConfirmation': ['到场时间与集合时刻需双方真人确认'],
                'evidence': [{'field': e.get('sourceLabel', ''), 'value': e.get('text', ''), 'source': e.get('source', '')} for e in item.get('evidence', [])[:6]],
                'hiddenFields': ['真实姓名', '联系方式', '精确位置', '原始听歌历史'],
                'safetyResult': 'passed',
                'exchangedFields': ['eventId', 'arrivalWindow', 'musicTags', 'socialIntent', 'groupSize', 'safetyConstraints'],
            } for item in ranked
        }

        # 7. 组队
        await self.call_tool(ctx, 'build_group', viewer=viewer, intent=intent, ranked=ranked)

        # 8. 生成有证据的理由
        await self.call_tool(ctx, 'generate_grounded_reason', ranked=ranked)

        state.ranked_candidates = ranked
        state.updated_at = time.time()

    # ---------------------------------------------------------------- 确认与房间
    async def invite(self, session_id: str, candidate_id: str) -> AgentState:
        """发起方确认要邀请谁 —— 进入 pending_confirmation。"""

        state = self._require(session_id)
        ctx = ToolContext(provider=self.provider, state=state)
        await self.call_tool(ctx, 'send_mutual_consent_invitation', candidate_id=candidate_id)
        state.pending_confirmation = {
            'required': True,
            'status': 'awaiting_peer',
            'candidateId': candidate_id,
            'proposerConfirmed': True,
            'peerConfirmed': False,
            'reason': '需要双方都确认后才创建临时房间',
            'nextAction': 'wait_peer',
        }
        state.status = 'pending_confirmation'
        state.updated_at = time.time()
        return state

    async def peer_confirm(self, session_id: str, accept: bool = True) -> AgentState:
        """Demo 中模拟"对方"的确认动作（真实产品里由对方客户端触发）。"""

        state = self._require(session_id)
        pending = state.pending_confirmation or {}
        if not pending.get('required') or not pending.get('proposerConfirmed'):
            raise ValueError('还没有发起邀请，不能直接确认')
        pending = {**pending, 'peerConfirmed': bool(accept), 'status': 'both_confirmed' if accept else 'declined'}
        pending['nextAction'] = 'create_temporary_room' if accept else 'back_to_matches'
        pending['reason'] = '双方都已确认，Agent 可以创建临时房间了' if accept else '对方暂时不方便，换一个人试试'
        state.pending_confirmation = pending
        state.updated_at = time.time()
        return state

    async def create_room(self, session_id: str) -> AgentState:
        state = self._require(session_id)
        ctx = ToolContext(provider=self.provider, state=state)
        ctx.cache['event'] = self.provider.get_event_context(state.event_id)
        ctx.cache['group_members'] = list((state.proposed_group or {}).get('members') or [])

        viewer_social = load_social_profile(state.user_id) or SocialProfile(
            user_id=state.user_id, display_name='你', city='', gender='undisclosed'
        )
        viewer = build_facts(state.music_profile, viewer_social) if state.music_profile else None
        partner = self._candidate_facts(state)

        pending = state.pending_confirmation or {}
        if not pending.get('proposerConfirmed') or not pending.get('peerConfirmed'):
            result = await self.call_tool(
                ctx,
                'create_temporary_room',
                partner=partner,
                viewer_social=viewer_social,
                viewer_facts=viewer,
                proposer_confirmed=bool(pending.get('proposerConfirmed')),
                peer_confirmed=bool(pending.get('peerConfirmed')),
            )
            state.updated_at = time.time()
            state.error = '双方尚未都确认，不能创建房间'
            return state

        await self.call_tool(
            ctx,
            'create_temporary_room',
            partner=partner,
            viewer_social=viewer_social,
            viewer_facts=viewer,
            proposer_confirmed=True,
            peer_confirmed=True,
        )
        state.updated_at = time.time()
        return state

    async def feedback(self, session_id: str, rating: str, tags: list[str], comment: str) -> AgentState:
        state = self._require(session_id)
        ctx = ToolContext(provider=self.provider, state=state)
        await self.call_tool(ctx, 'collect_feedback', rating=rating, tags=tags, comment=comment)
        state.updated_at = time.time()
        return state

    # ---------------------------------------------------------------- 辅助
    def _require(self, session_id: str) -> AgentState:
        state = self.get_session(session_id)
        if state is None:
            raise KeyError('会话不存在或已过期：' + session_id)
        return state

    def _candidate_facts(self, state: AgentState) -> CandidateFacts | None:
        partner_id = (state.pending_confirmation or {}).get('candidateId')
        if not partner_id:
            return None
        music = self.provider.get_user_music_profile(partner_id)
        social = load_social_profile(partner_id)
        if music is None or social is None:
            return None
        return build_facts(music, social)


def _shorten(kwargs: dict[str, Any]) -> str:
    parts: list[str] = []
    for key, value in kwargs.items():
        if isinstance(value, list):
            parts.append(key + '=' + str(len(value)) + ' 项')
        elif isinstance(value, (CandidateFacts, SocialProfile)):
            parts.append(key + '=' + getattr(value, 'user_id', '?'))
        elif isinstance(value, str):
            parts.append(key + '="' + value[:32] + '"')
        else:
            parts.append(key + '=' + str(value))
    return '，'.join(parts) or '无参数'


_ORCHESTRATOR: AgentOrchestrator | None = None


def get_orchestrator() -> AgentOrchestrator:
    global _ORCHESTRATOR
    if _ORCHESTRATOR is None:
        _ORCHESTRATOR = AgentOrchestrator()
    return _ORCHESTRATOR


def get_session(session_id: str) -> AgentState | None:
    return get_orchestrator().get_session(session_id)


def new_session_id() -> str:
    return uuid.uuid4().hex

