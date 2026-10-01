"""AgentService：真实调用链的编排层。

    Frontend
      → POST /api/agent/run
      → AgentService
      → 本地确定性流水线（app/agent/orchestrator：检索 / 安全过滤 / 评分 / 排序 / 双向确认）
      → LLMGateway（需要模型时）→ Provider → JSON Schema 校验
      → 返回匹配结果 + 运行轨迹 + 模型使用情况

大模型只负责：解析需求、写匹配理由、写破冰问题。
候选人、演出、歌名一律来自本地数据；模型输出里的歌名只有在本地曲库里真实存在才会被采用。
"""

from __future__ import annotations

import logging
from typing import Any

from app.agent import orchestrator as orch
from app.agent.state import ParsedIntent
from app.content import build_icebreakers
from app.integrations.base import get_tme_provider
from app.services.agent_runs import AgentRun, new_run_id, registry
from app.services.llm import (
    LLMError,
    MockProvider,
    get_llm_gateway,
)
from app.services.llm.prompts import build_intent_messages
from app.services.llm.schemas import ICEBREAKER_SCHEMA, PARSED_INTENT_SCHEMA, ParsedIntentPayload

logger = logging.getLogger('same_frequency.agent_service')

AGENT_MODE_NOTICE = {
    'mock': 'AGENT_MODE=mock：整条链路使用本地预设数据与确定性规则，未调用任何大模型 API',
}


class AgentService:
    """路由层唯一允许依赖的 Agent 入口。"""

    def __init__(self, gateway: Any | None = None) -> None:
        # 每次请求都按当前 settings 构建网关：改 backend/.env 后不需要重启进程
        self.gateway = gateway or get_llm_gateway()

    # ---------------------------------------------------------------- 状态
    def status(self) -> dict[str, Any]:
        return self.gateway.status()

    # ---------------------------------------------------------------- 解析需求
    async def parse_intent(
        self,
        *,
        text: str,
        event_id: str,
        user_id: str = 'u-viewer',
        scopes: list[str] | None = None,
    ) -> dict[str, Any]:
        """把自然语言需求解析成结构化条件；失败直接抛 LLMError，绝不返回编造的字段。"""

        messages = build_intent_messages(
            text,
            event_id,
            PARSED_INTENT_SCHEMA,
            extra={'userId': user_id, 'authorizedScopes': list(scopes or [])},
        )
        result = await self.gateway.parse_intent(messages)
        parsed: ParsedIntentPayload = result['payload']
        return {
            # 与既有 /api/agent/intent/parse 保持同一形状，前端可以直接复用
            'parsedIntent': _agent_payload(parsed, event_id),
            # 约定的结构化 Schema（concertId / groupSize / confidence ...）
            'structuredIntent': parsed.to_dict(),
            'source': result['source'],
            'provider': result['provider'],
            'model': result['model'],
            'attempts': result['attempts'],
            'elapsedMs': result['elapsedMs'],
            'usedFallback': result['source'] != 'model',
            'notice': _notice_for(result['source']),
        }

    # ---------------------------------------------------------------- 完整流程
    async def run(
        self,
        *,
        text: str,
        event_id: str,
        user_id: str = 'u-viewer',
        scopes: list[str] | None = None,
        demo_case: str = 'normal',
        parsed_intent: dict[str, Any] | None = None,
        run_id: str | None = None,
    ) -> dict[str, Any]:
        """跑一次完整流程；同一个 runId 不会重复启动，失败立刻登记 error。"""

        active_run_id = run_id or new_run_id()
        run: AgentRun = registry.begin(active_run_id)  # 同一 runId 重复启动会抛 ValueError
        logger.info('[agent-run] run=%s mode=%s provider=%s', active_run_id, self.gateway.mode, self.gateway.provider_name)
        try:
            # live 模式没有配置好模型时立刻失败：不进入加载动画、不重复请求
            self.gateway.ensure_available()
            intent_report = await self._resolve_intent(text, event_id, user_id, scopes, parsed_intent)
            agent = orch.get_orchestrator()
            state = await agent.start(
                session_id=active_run_id,
                user_id=user_id,
                event_id=event_id,
                raw_intent=text,
                authorized_scopes=list(scopes or []),
                demo_case=demo_case,
                intent_override=ParsedIntent.from_dict(intent_report['agentPayload']) if intent_report else None,
            )
            llm_report = await self._enrich(state)
            intent_meta = {k: v for k, v in (intent_report or {}).items() if k != 'agentPayload'}
            snapshot = {
                'mode': self.gateway.mode,
                'provider': self.gateway.status(),
                'state': state.to_dict(),
                'llm': {**intent_meta, **llm_report},
            }
            registry.finish(active_run_id, snapshot, steps=len(state.trace))
            logger.info('[agent-run] run=%s done steps=%d status=%s', active_run_id, len(state.trace), state.status)
            return {'runId': active_run_id, 'status': 'done', 'steps': len(state.trace), **snapshot}
        except LLMError as error:
            registry.fail(active_run_id, error.to_dict())
            logger.warning('[agent-run] run=%s failed code=%s', active_run_id, error.code)
            raise

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        run = registry.get(run_id)
        return run.to_dict() if run else None

    # ---------------------------------------------------------------- 内部
    async def _resolve_intent(
        self,
        text: str,
        event_id: str,
        user_id: str,
        scopes: list[str] | None,
        parsed_intent: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        """mock 模式返回 None（交给确定性规则解析）；live 模式必须真的问一次模型。"""

        if parsed_intent:
            # 用户在确认页改过的字段以用户为准，不再调用模型
            return {
                'intent': {'source': 'user'},
                'agentPayload': parsed_intent,
                'usedFallback': True,
                'notice': '使用你在确认页上修正后的结构化意图',
            }
        if self.gateway.is_mock:
            return None
        parsed = await self.parse_intent(text=text, event_id=event_id, user_id=user_id, scopes=scopes)
        # parse_intent 面向接口返回 parsedIntent（工具层契约），内部统一叫 agentPayload
        return {**parsed, 'agentPayload': parsed['parsedIntent']}

    async def _enrich(self, state: Any) -> dict[str, Any]:
        """补充模型生成的匹配理由与破冰问题；任何一步失败都如实记录，不伪造。"""

        report: dict[str, Any] = {
            'explanations': {},
            'icebreakers': {'source': 'rules', 'items': [], 'note': ''},
            'notes': [],
        }
        if self.gateway.is_mock:
            report['notes'].append(AGENT_MODE_NOTICE['mock'])
            shared = _top_shared(state)
            if shared:
                report['icebreakers'] = {
                    'source': 'rules',
                    'items': build_icebreakers({'hot_songs': shared}, {'purposes': []}, shared)[:4],
                    'note': AGENT_MODE_NOTICE['mock'],
                }
            else:
                report['icebreakers'] = {'source': 'rules', 'items': [], 'note': '没有共同歌曲，未生成破冰问题'}
            return report

        for item in (state.ranked_candidates or [])[:3]:
            candidate = item.get('candidate') or {}
            user_id = str(item.get('userId') or candidate.get('userId') or '')
            allowed = set(item.get('sharedSongs') or []) | set(candidate.get('topArtists') or []) | set(item.get('sharedSafety') or [])
            context = {
                'concertId': state.event_id,
                'candidate': {
                    'nickname': candidate.get('nickname'),
                    'sharedSongs': item.get('sharedSongs') or [],
                    'topArtists': candidate.get('topArtists') or [],
                    'sharedPurposes': item.get('sharedPurposes') or [],
                    'sharedSafety': item.get('sharedSafety') or [],
                },
                'score': item.get('score'),
                'scoreBreakdown': item.get('scoreBreakdown') or {},
            }
            try:
                result = await self.gateway.generate_explanation(context, allowed_terms=allowed)
            except LLMError as error:
                report['explanations'][user_id] = {'source': 'rules', 'reason': '', 'note': error.code + '：' + error.message}
                report['notes'].append('候选人 ' + (candidate.get('nickname') or user_id) + ' 的模型理由未生成（' + error.code + '）')
                continue
            item['modelReason'] = result['payload']['reason']
            item['reasonSource'] = 'model'
            report['explanations'][user_id] = {
                'source': 'model',
                'reason': result['payload']['reason'],
                'model': result['model'],
                'note': '',
            }

        shared = _top_shared(state)
        try:
            result = await self.gateway.generate_icebreakers(
                {
                    'concertId': state.event_id,
                    'sharedSongs': shared,
                    'purposes': list((state.parsed_intent.purposes if state.parsed_intent else []) or []),
                },
                ICEBREAKER_SCHEMA,
            )
        except LLMError as error:
            report['icebreakers'] = {'source': 'rules', 'items': [], 'note': error.code + '：' + error.message}
            report['notes'].append('模型破冰问题未生成（' + error.code + '），沿用房间里的本地话题')
        else:
            report['icebreakers'] = {'source': 'model', 'items': result['payload']['questions'], 'note': ''}
        return report


def _top_shared(state: Any) -> list[str]:
    for item in state.ranked_candidates or []:
        shared = item.get('sharedSongs') or []
        if shared:
            return list(shared)[:3]
    return []


def _notice_for(source: str) -> str:
    if source == 'mock':
        return MockProvider().describe().reason + '：本次使用本地预设数据模拟，未调用任何大模型 API'
    return ''


def _agent_payload(parsed: ParsedIntentPayload, event_id: str) -> dict[str, Any]:
    """把 Schema 结果映射成工具层认得的字段；歌名/歌手必须先在本地曲库里存在。"""

    provider = get_tme_provider()
    songs: list[str] = []
    artists: list[str] = []
    for preference in parsed.music_preferences:
        for track in provider.search_tracks(preference):
            if track.title not in songs:
                songs.append(track.title)
            if track.artist not in artists:
                artists.append(track.artist)

    payload = parsed.to_agent_payload()
    payload['mentionedSongs'] = songs
    payload['mentionedArtists'] = artists
    payload['eventId'] = parsed.concert_id or event_id
    payload['safety'] = [item for item in parsed.safety_constraints]
    return payload


def get_service() -> AgentService:
    """路由层用这个函数拿服务；测试可以替换它注入假的 HTTP transport。"""

    return AgentService()


__all__ = ['AGENT_MODE_NOTICE', 'AgentService', 'get_service']
