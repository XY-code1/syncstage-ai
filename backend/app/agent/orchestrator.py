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
from app.config import settings
from app.agent.tools import PIPELINE, TOOLS, ToolContext, ToolResult
from app.integrations.base import TMEDataProvider, get_tme_provider

SESSION_TTL_SECONDS = 60 * 60 * 6


def invite_ttl_ms() -> int:
    """邀请有效期（毫秒）：正式产品可配置，Demo 可调短 AGENT_INVITE_TTL_SECONDS 来演示超时分支。"""

    return max(1, int(settings.agent_invite_ttl_seconds)) * 1000


# 双向确认状态机：candidate -> awaiting_peer -> accepted / declined / expired / cancelled
CONSENT_STATUSES = ('candidate', 'awaiting_peer', 'accepted', 'declined', 'expired', 'cancelled')

# 评委演示模式的三个案例
DEMO_CASES = ('normal', 'safety_no_match', 'ai_fallback')


class AgentOrchestrator:
    def __init__(self, provider: TMEDataProvider | None = None) -> None:
        self.provider = provider or get_tme_provider()
        self._sessions: dict[str, AgentState] = {}
        # inviteId -> sessionId：对方视角只凭 inviteId 就能确认/拒绝，不需要知道发起方的会话。
        self._invites: dict[str, str] = {}
        self._lock = threading.RLock()

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
            for invite_id, session_id in list(self._invites.items()):
                if session_id == key:
                    self._invites.pop(invite_id, None)

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
        # 状态 1：已找到候选人，但双方都还没确认（只有 invite 才会进入 awaiting_peer）。
        state.pending_confirmation = {
            'required': True,
            'status': 'candidate',
            'inviteId': None,
            'candidateId': None,  # candidate 阶段还没选定邀请对象，invite 时才写入
            'proposerConfirmed': False,
            'peerConfirmed': False,
            'reason': '已找到候选人，双方都还没确认',
            'nextAction': 'invite',
            'createdAt': None,
            'expiresAt': None,
        }
        state.updated_at = time.time()

    # ---------------------------------------------------------------- 确认与房间
    async def invite(self, session_id: str, candidate_id: str) -> AgentState:
        """状态 2：发起方发出邀请 —— 进入 awaiting_peer，此时绝对不能建房。"""

        state = self._require(session_id)
        self._expire_if_needed(state)
        with self._lock:
            current = state.pending_confirmation or {}
            if current.get('status') in ('accepted', 'confirmed'):
                raise ValueError('这份邀请已经被接受，不能再重复发起')
            now_ms = int(time.time() * 1000)
            invite_id = 'inv-' + uuid.uuid4().hex[:12]
            state.pending_confirmation = {
                'required': True,
                'status': 'awaiting_peer',
                'inviteId': invite_id,
                'candidateId': candidate_id,
                'proposerConfirmed': True,
                'peerConfirmed': False,
                'reason': '需要双方都确认后才创建临时房间',
                'nextAction': 'wait_peer',
                'createdAt': now_ms,
                'expiresAt': now_ms + invite_ttl_ms(),
            }
            self._invites[invite_id] = session_id
            state.status = 'pending_confirmation'
            state.updated_at = time.time()
        ctx = ToolContext(provider=self.provider, state=state)
        await self.call_tool(ctx, 'send_mutual_consent_invitation', candidate_id=candidate_id)
        return state

    async def peer_confirm(self, session_id: str, accept: bool = True) -> AgentState:
        """状态 3/4：对方确认。只有仍是 awaiting_peer 的邀请能确认；撤回、过期、已接受都拒绝。"""

        state = self._require(session_id)
        with self._lock:
            self._expire_if_needed(state)
            pending = state.pending_confirmation or {}
            if not pending.get('required') or not pending.get('proposerConfirmed'):
                raise ValueError('还没有发起邀请，不能直接确认')
            if pending.get('status') != 'awaiting_peer':
                raise ValueError('这份邀请已失效，不能再确认')
            pending = {**pending, 'peerConfirmed': bool(accept), 'status': 'accepted' if accept else 'declined'}
            pending['nextAction'] = 'create_temporary_room' if accept else 'back_to_matches'
            pending['reason'] = '双方都已确认，Agent 可以创建临时房间了' if accept else '对方暂时不方便，换一个人试试'
            state.pending_confirmation = pending
            state.updated_at = time.time()
        return await self.create_room(session_id) if accept else state

    async def cancel_invite(self, session_id: str, expired: bool = False) -> AgentState:
        """状态 5/6：撤回或超时。发出邀请后、对方确认前可以撤回；已经 accepted 只能退出房间。"""

        state = self._require(session_id)
        with self._lock:
            self._expire_if_needed(state)
            pending = state.pending_confirmation or {}
            if expired and pending.get('status') == 'expired':
                # 已经超时：重复触发（例如前端倒计时兜底）不再报错。
                return state
            if pending.get('status') in ('accepted', 'confirmed'):
                raise ValueError('双方已经确认，不能撤回邀请；如需结束请退出房间')
            if pending.get('status') != 'awaiting_peer':
                raise ValueError('只有等待对方确认的邀请可以撤回或过期')
            state.pending_confirmation = {
                **pending,
                'status': 'expired' if expired else 'cancelled',
                'peerConfirmed': False,
                'nextAction': 'invite' if expired else 'back_to_matches',
                'reason': '邀请暂未得到回应，本次匹配已结束。' if expired else '邀请已由发起人撤回',
            }
            state.room_id = None
            state.room = {}
            state.updated_at = time.time()
        return state

    async def create_room(self, session_id: str) -> AgentState:
        state = self._require(session_id)
        # 幂等：双方几乎同时确认时只认已经建好的那一个房间（roomId 由 sessionId 决定 + INSERT OR IGNORE）。
        if state.room_id and (state.pending_confirmation or {}).get('status') in ('accepted', 'confirmed'):
            return state
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

    # ------------------------------------------------- 对方视角（跨浏览器 / 跨会话）
    def _expire_if_needed(self, state: AgentState) -> AgentState:
        """惰性过期：等待中的邀请一旦超过有效期就变成 expired，且永远不会建房。"""

        pending = state.pending_confirmation or {}
        if pending.get('status') != 'awaiting_peer':
            return state
        if int(pending.get('expiresAt') or 0) > int(time.time() * 1000):
            return state
        state.pending_confirmation = {
            **pending,
            'status': 'expired',
            'peerConfirmed': False,
            'nextAction': 'invite',
            'reason': '邀请暂未得到回应，本次匹配已结束。',
        }
        state.updated_at = time.time()
        return state

    def _invitation_view(self, state: AgentState) -> dict[str, Any]:
        """给对方看的邀请摘要：活动、共同曲目、匹配理由、公开集合点与有效期。"""

        pending = state.pending_confirmation or {}
        candidate_id = str(pending.get('candidateId') or '')
        ranked = next((item for item in state.ranked_candidates if item.get('userId') == candidate_id), None) or {}
        candidate = ranked.get('candidate') or {}
        try:
            event = self.provider.get_event_context(state.event_id)
        except Exception:  # noqa: BLE001 - 邀请摘要缺演出信息也不能影响确认链路
            event = None
        meeting = dict(getattr(event, 'meeting_point', {}) or {})
        proposer = load_social_profile(state.user_id)
        from_name = (proposer.display_name if proposer else '') or ''
        if not from_name or from_name == '你':
            # 对方视角不能出现「你邀请你」这种自我指代；演示身份统一显示为 Demo访客。
            from_name = 'Demo访客'
        return {
            'inviteId': pending.get('inviteId'),
            'fromUserId': state.user_id,
            'fromName': from_name,
            'toUserId': candidate_id,
            'toNickname': candidate.get('nickname') or '',
            'eventId': state.event_id,
            'concertTitle': getattr(event, 'title', '') or '',
            'venue': getattr(event, 'venue', '') or '',
            'meetingPoint': ' · '.join(part for part in (meeting.get('name', ''), meeting.get('time', '')) if part),
            'safety': meeting.get('note') or '只在公开场合见面',
            'sharedSongs': list(ranked.get('sharedSongs') or []),
            'matchReason': ranked.get('matchReason') or '',
            'score': ranked.get('score'),
            'createdAt': pending.get('createdAt'),
            'expiresAt': pending.get('expiresAt'),
            'status': pending.get('status'),
        }

    def list_invitations(self, user_id: str, nickname: str = '') -> list[dict[str, Any]]:
        """对方视角：列出「正在等待我确认」的同行邀请。只读，不建房、不调用模型。

        - 默认按 candidateId == userId 精确匹配；
        - Demo 双身份可以用 nickname 把演示替身（如「写歌的江离」）映射到真实候选人。
        """

        if not user_id and not nickname:
            return []
        items: list[dict[str, Any]] = []
        with self._lock:
            for state in list(self._sessions.values()):
                self._expire_if_needed(state)
                pending = state.pending_confirmation or {}
                if pending.get('status') != 'awaiting_peer':
                    continue
                view = self._invitation_view(state)
                if user_id and view.get('toUserId') == user_id:
                    items.append(view)
                elif nickname and view.get('toNickname') == nickname:
                    items.append(view)
        items.sort(key=lambda item: int(item.get('createdAt') or 0), reverse=True)
        return items

    async def respond_invitation(self, invite_id: str, accept: bool) -> AgentState:
        """对方视角的确认入口：只凭 inviteId 接受或拒绝，不需要知道发起方会话。"""

        with self._lock:
            session_id = self._invites.get(invite_id)
        if not session_id or session_id not in self._sessions:
            raise KeyError('这份邀请不存在或已失效，请让发起方重新邀请')
        return await self.peer_confirm(session_id, accept)

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

