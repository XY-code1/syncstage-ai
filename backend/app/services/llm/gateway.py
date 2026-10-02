"""LLMGateway：大模型调用的唯一入口。

职责：
1. 按 AGENT_MODE / LLM_PROVIDER 选择 Provider
   （mock = 本地预设数据模拟，绝不发网络请求；deepseek = DeepSeekProvider）；
2. 负责 JSON 解析 + Schema 校验；
3. Schema 不合法最多重试一次，之后抛 LLM_SCHEMA_INVALID；
4. 未配置时立即抛 LLM_NOT_CONFIGURED —— 不进入加载动画、不重复请求、不静默回退；
5. 禁止无限轮询：这里没有循环重试，只有一次显式重试，且不会自动重发。

Deterministic 的候选人检索 / 安全过滤 / 评分 / 排序 / 双向确认都不在这里，
由 app/agent 下的本地代码完成；模型只负责解析需求、写理由、写破冰问题。
"""

from __future__ import annotations

import json
import logging
from typing import Any, Awaitable, Callable

from app.config import settings

from .base import LLMChatResult, LLMProvider
from .deepseek_provider import DeepSeekProvider
from .errors import LLM_BAD_RESPONSE, LLM_NOT_CONFIGURED, LLM_SCHEMA_INVALID, LLMError
from .mock_provider import MockProvider
from .schemas import (
    EXPLANATION_SCHEMA,
    ICEBREAKER_SCHEMA,
    PARSED_INTENT_SCHEMA,
    validate_explanation,
    validate_icebreakers,
    validate_parsed_intent,
)

logger = logging.getLogger('same_frequency.llm')

# 约定：Schema 不合法最多重试一次（总计 2 次调用），之后直接失败。
MAX_SCHEMA_ATTEMPTS = 2


class LLMGateway:
    def __init__(self, provider: LLMProvider, *, mode: str = 'mock', timeout_seconds: float = 20.0) -> None:
        self.provider = provider
        self.mode = (mode or 'mock').strip().lower()
        self.timeout_seconds = float(timeout_seconds or 20.0)

    # ---------------------------------------------------------------- 状态
    @property
    def is_mock(self) -> bool:
        return bool(self.provider.is_mock)

    @property
    def provider_name(self) -> str:
        return self.provider.name

    def status(self) -> dict[str, Any]:
        """可安全下发前端的状态：模式 / Provider / 模型 / 是否配置成功，绝不含 Key。"""

        provider = self.provider.describe()
        configured = provider.configured and (self.is_mock or self.mode == 'live')
        reason = provider.reason
        if not self.is_mock and self.mode != 'live':
            reason = 'agent_mode_not_live'
        return {
            'mode': self.mode,
            'provider': provider.name,
            'model': provider.model,
            'baseUrl': provider.base_url,
            'timeoutSeconds': self.timeout_seconds,
            'configured': configured,
            'isMock': provider.is_mock,
            'reason': reason,
        }

    async def health_check(self) -> dict[str, Any]:
        report = await self.provider.health_check()
        return {**report, 'mode': self.mode, 'provider': self.provider.name, 'isMock': self.is_mock}

    def ensure_available(self) -> None:
        """配置自检：live 模式缺少 Key/模型时立刻抛 LLM_NOT_CONFIGURED。

        路由层在进入加载动画之前调用它，避免"转圈半天最后说没配置"。
        """

        if self.provider.is_mock:
            # 本地预设数据模拟：允许直接返回，但调用方必须标注为 Demo 模拟 Agent
            return
        if self.mode != 'live':
            raise LLMError(
                LLM_NOT_CONFIGURED,
                '当前是 Demo 模拟模式（AGENT_MODE=mock），不会调用任何大模型 API',
                hint='需要真实模型时，把 backend/.env 的 AGENT_MODE 改成 live 并配置 LLM_API_KEY',
            )
        if not self.provider.describe().configured:
            raise LLMError(
                LLM_NOT_CONFIGURED,
                hint='请在 backend/.env 里配置 LLM_API_KEY 与 LLM_MODEL（密钥只能放后端）',
            )

    # ---------------------------------------------------------------- 调用
    async def _call(
        self,
        run: Callable[[], Awaitable[LLMChatResult]],
        validate: Callable[[Any], dict[str, Any]],
        *,
        label: str,
    ) -> dict[str, Any]:
        self.ensure_available()
        last: LLMError | None = None
        for attempt in range(1, MAX_SCHEMA_ATTEMPTS + 1):
            result = await run()  # 传输层错误（超时 / 401 / 连不上）直接抛，不重试
            try:
                payload = _loads_json(result.text)
                validated = validate(payload)
            except LLMError as error:
                # 约定：JSON 解析失败 / Schema 不合法都最多重试一次，之后直接失败
                if error.code not in (LLM_SCHEMA_INVALID, LLM_BAD_RESPONSE) or attempt >= MAX_SCHEMA_ATTEMPTS:
                    raise
                last = error
                logger.warning('[llm:%s] %s 第 %d 次输出无法解析为合法 Schema，重试一次（%s）', self.provider_name, label, attempt, error.code)
                continue
            logger.info(
                '[llm:%s] %s ok model=%s %dms mock=%s',
                self.provider_name, label, result.model, result.elapsed_ms, result.is_mock,
            )
            return {
                'payload': validated,
                'source': 'mock' if result.is_mock else 'model',
                'provider': self.provider_name,
                'model': result.model,
                'elapsedMs': result.elapsed_ms,
                'attempts': attempt,
            }
        raise last or LLMError(LLM_SCHEMA_INVALID)

    async def parse_intent(
        self,
        messages: list[dict[str, str]],
        schema: dict[str, Any] = PARSED_INTENT_SCHEMA,
    ) -> dict[str, Any]:
        return await self._call(lambda: self.provider.parse_intent(messages, schema), validate_parsed_intent, label='parse_intent')

    async def generate_explanation(
        self,
        context: dict[str, Any],
        schema: dict[str, Any] = EXPLANATION_SCHEMA,
        *,
        allowed_terms: set[str] | None = None,
    ) -> dict[str, Any]:
        def validate(payload: Any) -> dict[str, Any]:
            return validate_explanation(payload, allowed_terms=allowed_terms)

        return await self._call(
            lambda: self.provider.generate_explanation(context, schema),
            validate,
            label='explanation',
        )

    async def generate_icebreakers(
        self,
        context: dict[str, Any],
        schema: dict[str, Any] = ICEBREAKER_SCHEMA,
    ) -> dict[str, Any]:
        return await self._call(lambda: self.provider.generate_icebreakers(context, schema), validate_icebreakers, label='icebreakers')


def build_provider() -> LLMProvider:
    """按当前环境变量构建 Provider；mock 模式永远不会拿到联网 Provider。"""

    mode = (settings.agent_mode or 'mock').strip().lower()
    name = (settings.llm_provider or 'deepseek').strip().lower()
    if mode != 'live' or name == 'mock':
        return MockProvider()
    if name == 'deepseek':
        return DeepSeekProvider(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            base_url=settings.llm_base_url,
            timeout_seconds=settings.llm_timeout_seconds,
            disable_thinking=settings.llm_disable_thinking,
        )
    raise LLMError(
        LLM_NOT_CONFIGURED,
        '不支持的大模型厂商：' + name,
        hint='LLM_PROVIDER 目前只支持 deepseek（或 mock）',
    )


def get_llm_gateway() -> LLMGateway:
    """每次读取当前 settings，便于运行期切换 mock / live 而不需要重启进程。"""

    return LLMGateway(build_provider(), mode=settings.agent_mode, timeout_seconds=settings.llm_timeout_seconds)


def _loads_json(text: str) -> Any:
    """模型偶尔会包 Markdown 代码块或前后加话术，这里只做一次明确的容错解析。"""

    body = (text or '').strip()
    if body.startswith('```'):
        body = body.split('```')[1] if '```' in body[3:] else body[3:]
        if body.startswith('json'):
            body = body[4:]
        body = body.strip()
    try:
        return json.loads(body)
    except ValueError:
        start, end = body.find('{'), body.rfind('}')
        if start >= 0 and end > start:
            try:
                return json.loads(body[start:end + 1])
            except ValueError:
                pass
    raise LLMError(LLM_BAD_RESPONSE, detail=body[:200])
