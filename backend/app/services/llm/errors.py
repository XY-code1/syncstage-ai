"""统一的网关错误类型。

任何调用方（路由 / AgentService / 工具）都必须拿到明确的
code + message + hint，由页面如实展示；网关内部绝不静默回退、
也绝不把上游错误包装成"看起来成功的模型输出"。
"""

from __future__ import annotations

import re
from typing import Any

# 错误码（大写常量，前后端与日志用同一套字符串稳定匹配）
LLM_NOT_CONFIGURED = 'LLM_NOT_CONFIGURED'
LLM_AUTH_FAILED = 'LLM_AUTH_FAILED'
LLM_MODEL_NOT_FOUND = 'LLM_MODEL_NOT_FOUND'
LLM_BAD_REQUEST = 'LLM_BAD_REQUEST'
LLM_RATE_LIMITED = 'LLM_RATE_LIMITED'
LLM_TIMEOUT = 'LLM_TIMEOUT'
LLM_CONNECTION = 'LLM_CONNECTION'
LLM_UPSTREAM_ERROR = 'LLM_UPSTREAM_ERROR'
LLM_BAD_RESPONSE = 'LLM_BAD_RESPONSE'
LLM_SCHEMA_INVALID = 'LLM_SCHEMA_INVALID'

ERROR_MESSAGES: dict[str, str] = {
    LLM_NOT_CONFIGURED: '尚未配置大模型服务（live 模式需要 backend/.env 里的 LLM_API_KEY 与 LLM_MODEL）',
    LLM_AUTH_FAILED: '大模型拒绝了这次请求：API Key 无效或没有该模型的权限',
    LLM_MODEL_NOT_FOUND: '大模型服务里找不到配置的 model',
    LLM_BAD_REQUEST: '大模型认为请求格式不合法',
    LLM_RATE_LIMITED: '大模型触发了限流，请稍后重试',
    LLM_TIMEOUT: '等待大模型响应超时',
    LLM_CONNECTION: '无法连接大模型服务',
    LLM_UPSTREAM_ERROR: '大模型服务返回了错误',
    LLM_BAD_RESPONSE: '大模型返回的内容不是合法 JSON',
    LLM_SCHEMA_INVALID: '大模型返回的 JSON 不符合约定的 Schema',
}

# 错误码 -> HTTP 状态码：让前端能区分"没配置 / Key 无效 / 超时 / 上游故障"
STATUS_BY_CODE: dict[str, int] = {
    LLM_NOT_CONFIGURED: 503,
    LLM_AUTH_FAILED: 401,
    LLM_MODEL_NOT_FOUND: 400,
    LLM_BAD_REQUEST: 400,
    LLM_RATE_LIMITED: 429,
    LLM_TIMEOUT: 504,
    LLM_CONNECTION: 502,
    LLM_UPSTREAM_ERROR: 502,
    LLM_BAD_RESPONSE: 502,
    LLM_SCHEMA_INVALID: 502,
}

# 上游返回片段里可能带 Authorization 回显，出日志/出响应前统一打码
_SECRET_PATTERN = re.compile(r'(sk-[A-Za-z0-9_\-]{4,}|Bearer\s+[A-Za-z0-9._\-]{8,})', re.IGNORECASE)


def redact(text: str) -> str:
    """把疑似密钥打码；日志与错误详情都只允许输出打码后的文本。"""

    return _SECRET_PATTERN.sub('***', text or '')


class LLMError(RuntimeError):
    """网关统一错误：前端会原样展示 code / message / hint，绝不静默回退。"""

    def __init__(
        self,
        code: str,
        message: str | None = None,
        *,
        hint: str = '',
        upstream_status: int | None = None,
        detail: str = '',
    ) -> None:
        self.code = code
        self.message = message or ERROR_MESSAGES.get(code, '大模型调用失败')
        self.hint = hint
        self.upstream_status = upstream_status
        self.detail = redact(detail)[:600]
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            'code': self.code,
            'message': self.message,
            'hint': self.hint,
        }
        if self.upstream_status is not None:
            payload['upstreamStatus'] = self.upstream_status
        if self.detail:
            payload['detail'] = self.detail
        return payload


def http_status_for_code(code: str) -> int:
    return STATUS_BY_CODE.get(code, 502)


def http_status_for(error: LLMError) -> int:
    return http_status_for_code(error.code)