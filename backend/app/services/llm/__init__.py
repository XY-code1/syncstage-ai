"""厂商无关的大模型网关。

对外只暴露 LLMGateway / get_llm_gateway / LLMError：
业务代码不允许直接依赖 DeepSeek SDK 或自己拼 HTTP 请求。

    from app.services.llm import get_llm_gateway, LLMError

    gateway = get_llm_gateway()
    result = await gateway.parse_intent(messages)
    result['payload']  # 已通过 Schema 校验的结构化条件
    result['source']   # 'model' | 'mock'
"""

from .base import LLMChatResult, LLMProvider, ProviderStatus
from .deepseek_provider import DeepSeekProvider
from .errors import (
    ERROR_MESSAGES,
    LLM_AUTH_FAILED,
    LLM_BAD_REQUEST,
    LLM_BAD_RESPONSE,
    LLM_CONNECTION,
    LLM_MODEL_NOT_FOUND,
    LLM_NOT_CONFIGURED,
    LLM_RATE_LIMITED,
    LLM_SCHEMA_INVALID,
    LLM_TIMEOUT,
    LLM_UPSTREAM_ERROR,
    LLMError,
    http_status_for,
    http_status_for_code,
    redact,
)
from .gateway import LLMGateway, build_provider, get_llm_gateway
from .mock_provider import MOCK_NOTICE, MockProvider

__all__ = [
    'ERROR_MESSAGES',
    'LLM_AUTH_FAILED',
    'LLM_BAD_REQUEST',
    'LLM_BAD_RESPONSE',
    'LLM_CONNECTION',
    'LLM_MODEL_NOT_FOUND',
    'LLM_NOT_CONFIGURED',
    'LLM_RATE_LIMITED',
    'LLM_SCHEMA_INVALID',
    'LLM_TIMEOUT',
    'LLM_UPSTREAM_ERROR',
    'LLMChatResult',
    'LLMError',
    'LLMGateway',
    'LLMProvider',
    'MOCK_NOTICE',
    'MockProvider',
    'ProviderStatus',
    'DeepSeekProvider',
    'build_provider',
    'get_llm_gateway',
    'http_status_for',
    'http_status_for_code',
    'redact',
]