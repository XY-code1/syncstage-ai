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

# 测试注入点：单元测试用 httpx.MockTransport 替换真实网络，生产环境保持 None。
TEST_TRANSPORT: httpx.AsyncBaseTransport | None = None


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
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.api_key = (api_key or '').strip()
        self.model = (model or '').strip()
        self.base_url = (base_url or DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
        self.timeout_seconds = float(timeout_seconds or 20.0)
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
            raise self._error_from_response(response)
        try:
            data = response.json()
        except ValueError as error:
            raise LLMError(LLM_BAD_RESPONSE, detail=redact(response.text)[:300]) from error

        text = _content_of(data)
        if not text.strip():
            raise LLMError(LLM_BAD_RESPONSE, '大模型没有返回任何正文', detail=redact(response.text)[:200])
        model = str(data.get('model') or self.model)
        choice = (data.get('choices') or [{}])[0] or {}
        logger.info('[llm:deepseek] ← status=%s model=%s %dms', response.status_code, model, elapsed)
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
            code, hint = LLM_RATE_LIMITED, '上游限流，稍后重试'
        elif status in (400, 422):
            code, hint = LLM_BAD_REQUEST, '上游认为请求体不合法'
        else:
            code, hint = LLM_UPSTREAM_ERROR, ''
        logger.warning('[llm:deepseek] ✗ HTTP %s -> %s', status, code)
        return LLMError(code, hint=hint, upstream_status=status, detail=body)

    async def health_check(self) -> dict[str, Any]:
        started = time.perf_counter()
        try:
            result = await self._chat(
                [
                    {'role': 'system', 'content': '只回答一个汉字。'},
                    {'role': 'user', 'content': '在吗'},
                ],
                temperature=0.0,
                max_tokens=8,
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
        return await self._chat(messages, temperature=0.2, max_tokens=800, json_mode=True)

    async def generate_explanation(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        from .prompts import build_explanation_messages

        return await self._chat(
            build_explanation_messages(context, schema),
            temperature=0.4,
            max_tokens=400,
            json_mode=True,
        )

    async def generate_icebreakers(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        from .prompts import build_icebreaker_messages

        return await self._chat(
            build_icebreaker_messages(context, schema),
            temperature=0.7,
            max_tokens=600,
            json_mode=True,
        )


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
