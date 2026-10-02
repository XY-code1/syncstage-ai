"""DeepSeek 适配器（OpenAI 兼容的 /chat/completions）。

约定：
- 密钥只从后端环境变量读取（config.llm_api_key / 兼容 DEEPSEEK_API_KEY），
  绝不下发前端、绝不写进日志、绝不返回给调用方；
- 只允许请求 settings.llm_base_url 指向的地址（默认 https://api.deepseek.com）；
- 超时/鉴权/限流/连接失败都映射成明确的 LLMError，不做任何静默回退；
- 单元测试用 transport=httpx.MockTransport(...) 注入假 HTTP，不需要真实 Key。
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from .base import LLMChatResult, LLMProvider, ProviderStatus
from .errors import (
    LLM_AUTH_FAILED,
    LLM_BAD_REQUEST,
    LLM_BAD_RESPONSE,
    LLM_CONNECTION,
    LLM_INSUFFICIENT_BALANCE,
    LLM_MODEL_NOT_FOUND,
    LLM_NOT_CONFIGURED,
    LLM_RATE_LIMITED,
    LLM_TIMEOUT,
    LLM_UPSTREAM_ERROR,
    LLMError,
    redact,
)

logger = logging.getLogger('same_frequency.llm.deepseek')

DEFAULT_BASE_URL = 'https://api.deepseek.com'
DEFAULT_MODEL = 'deepseek-flash'

# 单次 max_tokens 的上限：推理模型的推理过程也吃预算，扩预算重试时不会超过这个值。
MAX_TOKEN_BUDGET = 8192

# 测试注入点：单元测试用 httpx.MockTransport 替换真实网络，生产环境保持 None。
TEST_TRANSPORT: httpx.AsyncBaseTransport | None = None

# 429 里要区分「限流」与「余额不足」：余额问题重试无效，必须给出可执行的提示。
_BALANCE_MARKERS = (
    'insufficient balance',
    'insufficient_quota',
    'insufficient quota',
    'account balance',
    'balance is not enough',
    '余额不足',
    '欠费',
)


def _looks_like_balance(body: str) -> bool:
    text = (body or '').lower()
    return any(marker in text for marker in _BALANCE_MARKERS)


def _request_id_of(response: httpx.Response) -> str:
    # 上游请求号只用于排查，绝不包含密钥：先读 Header，再退回错误体。
    for header in ('x-request-id', 'x-ds-trace-id', 'x-trace-id', 'request-id'):
        value = (response.headers.get(header) or '').strip()
        if value:
            return value
    try:
        data = response.json()
    except ValueError:
        return ''
    if not isinstance(data, dict):
        return ''
    error = data.get('error')
    candidates: list[object] = []
    if isinstance(error, dict):
        candidates.extend([error.get('request_id'), error.get('requestId'), error.get('id')])
    candidates.extend([data.get('request_id'), data.get('requestId'), data.get('id')])
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return ''


class DeepSeekProvider(LLMProvider):
    name = 'deepseek'
    is_mock = False

    def __init__(
        self,
        *,
        api_key: str = '',
        model: str = DEFAULT_MODEL,
        base_url: str = DEFAULT_BASE_URL,
        timeout_seconds: float = 20.0,
        disable_thinking: bool = True,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = (api_key or '').strip()
        self.model = (model or '').strip()
        self.base_url = (base_url or DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
        self.timeout_seconds = float(timeout_seconds or 20.0)
        # 结构化抽取任务不需要长链推理：推理模型会把 token 预算耗在 reasoning_content 上，
        # 导致正文为空或超时。默认请求网关闭推理，网关不支持时可关闭此开关。
        self.disable_thinking = bool(disable_thinking)
        self._transport = transport

    # ---------------------------------------------------------------- 状态
    @property
    def chat_url(self) -> str:
        return self.base_url.rstrip('/') + '/chat/completions'

    def describe(self) -> ProviderStatus:
        if not self.model:
            reason = 'no_model'
        elif not self.api_key:
            reason = 'no_api_key'
        else:
            reason = 'ready'
        return ProviderStatus(
            name=self.name,
            model=self.model,
            base_url=self.base_url,
            configured=reason == 'ready',
            is_mock=False,
            timeout_seconds=self.timeout_seconds,
            reason=reason,
        )

    def _missing_config_error(self) -> LLMError:
        status = self.describe()
        hint = (
            '请在 backend/.env 里配置 LLM_MODEL'
            if status.reason == 'no_model'
            else '请在 backend/.env 里配置 LLM_API_KEY（密钥只能放后端，不能写进前端）'
        )
        return LLMError(LLM_NOT_CONFIGURED, hint=hint)

    # ---------------------------------------------------------------- 调用
    def _headers(self) -> dict[str, str]:
        return {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + self.api_key,
        }

    async def _chat(
        self,
        messages: list[dict[str, str]],
        *,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
        _budget_retried: bool = False,
        _thinking_retried: bool = False,
    ) -> LLMChatResult:
        status = self.describe()
        if not status.configured:
            raise self._missing_config_error()

        payload: dict[str, Any] = {
            'model': self.model,
            'messages': messages,
            'temperature': temperature,
            'max_tokens': max_tokens,
            'stream': False,
        }
        if self.disable_thinking:
            # DeepSeek / 兼容网关的关闭推理写法；不认识该字段的网关会忽略它。
            payload['thinking'] = {'type': 'disabled'}
        if json_mode:
            payload['response_format'] = {'type': 'json_object'}

        transport = self._transport if self._transport is not None else TEST_TRANSPORT
        started = time.perf_counter()
        logger.info('[llm:deepseek] → url=%s model=%s messages=%d', self.chat_url, self.model, len(messages))
        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds, transport=transport) as client:
                response = await client.post(self.chat_url, json=payload, headers=self._headers())
        except httpx.TimeoutException as error:
            elapsed = int((time.perf_counter() - started) * 1000)
            logger.warning('[llm:deepseek] ✗ timeout after %dms', elapsed)
            raise LLMError(
                LLM_TIMEOUT,
                hint='等待大模型超过 ' + str(self.timeout_seconds) + ' 秒，可调大 LLM_TIMEOUT_SECONDS',
                detail=str(error)[:200],
            ) from error
        except httpx.HTTPError as error:
            elapsed = int((time.perf_counter() - started) * 1000)
            logger.warning('[llm:deepseek] ✗ connection failed after %dms：%s', elapsed, type(error).__name__)
            raise LLMError(
                LLM_CONNECTION,
                hint='请确认能访问 ' + self.base_url,
                detail=str(error)[:200],
            ) from error

        elapsed = int((time.perf_counter() - started) * 1000)
        if response.status_code >= 400:
            # 部分网关不认识 thinking 字段并直接 400：去掉该字段重试一次，不做无限重试。
            if (
                response.status_code in (400, 422)
                and 'thinking' in payload
                and not _thinking_retried
            ):
                logger.warning('[llm:deepseek] 网关不接受 thinking 字段（HTTP %s），去掉后重试一次', response.status_code)
                self.disable_thinking = False
                try:
                    return await self._chat(
                        messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        json_mode=json_mode,
                        _budget_retried=_budget_retried,
                        _thinking_retried=True,
                    )
                finally:
                    self.disable_thinking = True
            raise self._error_from_response(response)
        try:
            data = response.json()
        except ValueError as error:
            raise LLMError(LLM_BAD_RESPONSE, detail=redact(response.text)[:300]) from error

        text = _content_of(data)
        if not text.strip():
            # 推理模型（如 deepseek-flash）会先输出 reasoning_content，且推理 token 同样计入
            # max_tokens；预算被推理占满时正文就是空的（finish_reason=length）。
            # 这不是网络或鉴权问题，因此不刷新页面、不无限重试，只做一次有界扩容重试。
            finish = str(((data.get('choices') or [{}])[0] or {}).get('finish_reason') or '')
            if finish == 'length' and not _budget_retried and max_tokens < MAX_TOKEN_BUDGET:
                bigger = min(max_tokens * 4, MAX_TOKEN_BUDGET)
                logger.warning('[llm:deepseek] 正文为空且被 length 截断，用更大预算重试一次（%d -> %d）', max_tokens, bigger)
                return await self._chat(
                    messages,
                    temperature=temperature,
                    max_tokens=bigger,
                    json_mode=json_mode,
                    _budget_retried=True,
                )
            usage = data.get('usage') or {}
            reasoning_tokens = int((usage.get('completion_tokens_details') or {}).get('reasoning_tokens') or 0)
            hint = ''
            if finish == 'length' or reasoning_tokens or _reasoning_of(data):
                hint = (
                    '该模型会先输出推理内容（reasoning_content），推理 token 也占 max_tokens 预算；'
                    '正文为空通常是预算被推理占满，可换用非推理模型或调大预算'
                )
            raise LLMError(LLM_BAD_RESPONSE, '大模型没有返回任何正文', hint=hint, detail=redact(response.text)[:200])
        model = str(data.get('model') or self.model)
        choice = (data.get('choices') or [{}])[0] or {}
        request_id = _request_id_of(response)
        logger.info('[llm:deepseek] ← status=%s model=%s %dms requestId=%s', response.status_code, model, elapsed, request_id or '-')
        return LLMChatResult(
            text=text,
            model=model,
            provider=self.name,
            elapsed_ms=elapsed,
            finish_reason=str(choice.get('finish_reason') or ''),
            usage=data.get('usage') or {},
        )

    def _error_from_response(self, response: httpx.Response) -> LLMError:
        body = redact(response.text)[:400]
        status = response.status_code
        if status in (401, 403):
            code, hint = LLM_AUTH_FAILED, '检查 backend/.env 里的 LLM_API_KEY 是否正确、是否开通了该模型'
        elif status == 404:
            code, hint = LLM_MODEL_NOT_FOUND, '检查 LLM_MODEL 是否在 ' + self.base_url + ' 上真实存在'
        elif status == 429:
            if _looks_like_balance(body):
                code = LLM_INSUFFICIENT_BALANCE
                hint = (
                    '请在 DeepSeek 控制台充值，或更换 backend/.env 里的 LLM_API_KEY 后重启后端；'
                    '系统不会自动重试，也不会切换到 Demo / 模拟结果'
                )
            else:
                code, hint = LLM_RATE_LIMITED, '上游限流，请稍后重试（不会自动重试，也不会切换 Demo 模式）'
        elif status in (400, 422):
            code, hint = LLM_BAD_REQUEST, '上游认为请求体不合法'
        else:
            code, hint = LLM_UPSTREAM_ERROR, ''
        request_id = _request_id_of(response)
        logger.warning('[llm:deepseek] ✗ HTTP %s -> %s requestId=%s', status, code, request_id or '-')
        return LLMError(code, hint=hint, upstream_status=status, detail=body, request_id=request_id)

    async def health_check(self) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            result = await self._chat(
                [
                    {'role': 'system', 'content': '只回答一个汉字。'},
                    {'role': 'user', 'content': '在吗'},
                ],
                temperature=0.0,
                max_tokens=256,
                json_mode=False,
            )
        except LLMError as error:
            return {
                'ok': False,
                'code': error.code,
                'message': error.message,
                'hint': error.hint,
                'elapsedMs': int((time.perf_counter() - started) * 1000),
            }
        return {
            'ok': True,
            'code': '',
            'message': 'DeepSeek 可用',
            'model': result.model,
            'elapsedMs': result.elapsed_ms,
        }

    # ---------------------------------------------------------------- 三个能力
    async def parse_intent(self, messages: list[dict[str, str]], schema: dict[str, Any]) -> LLMChatResult:
        return await self._chat(messages, temperature=0.2, max_tokens=1024, json_mode=True)

    async def generate_explanation(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        from .prompts import build_explanation_messages

        return await self._chat(
            build_explanation_messages(context, schema),
            temperature=0.4,
            max_tokens=1024,
            json_mode=True,
        )

    async def generate_icebreakers(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        from .prompts import build_icebreaker_messages

        return await self._chat(
            build_icebreaker_messages(context, schema),
            temperature=0.7,
            max_tokens=1024,
            json_mode=True,
        )


def _reasoning_of(data: dict[str, Any]) -> str:
    """读取推理模型特有的 reasoning_content（仅用于诊断提示，绝不当作正文返回）。"""

    choice = (data.get('choices') or [{}])[0] or {}
    message = choice.get('message') or {}
    value = message.get('reasoning_content') or message.get('reasoning')
    return '' if value is None else str(value)


def _content_of(data: dict[str, Any]) -> str:
    """兼容 OpenAI 风格的 choices[0].message.content（含 content 为数组的情况）。"""

    choice = (data.get('choices') or [{}])[0] or {}
    message = choice.get('message') or {}
    content = message.get('content')
    if isinstance(content, list):
        parts = [str(item.get('text') or '') for item in content if isinstance(item, dict)]
        return ''.join(parts)
    if content is None:
        return ''
    return str(content)
