"""厂商无关的 LLMProvider 抽象。

业务代码（路由 / AgentService / Agent 工具）只允许调用 LLMGateway，
不得直接 import 任何厂商 SDK 或自己拼 HTTP 请求。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class LLMChatResult:
    """一次模型调用的原始返回（mock provider 也会带上 is_mock=True 便于如实标注）。"""

    text: str
    model: str
    provider: str
    elapsed_ms: int = 0
    finish_reason: str = ''
    usage: dict[str, Any] = field(default_factory=dict)
    is_mock: bool = False


@dataclass(frozen=True)
class ProviderStatus:
    """可安全下发到前端的 Provider 状态：绝不含 API Key。"""

    name: str
    model: str
    base_url: str
    configured: bool
    is_mock: bool
    timeout_seconds: float
    reason: str = ''

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'model': self.model,
            'baseUrl': self.base_url,
            'configured': self.configured,
            'isMock': self.is_mock,
            'timeoutSeconds': self.timeout_seconds,
            'reason': self.reason,
        }


class LLMProvider(ABC):
    """所有厂商适配器的统一接口。"""

    name: str = 'base'
    is_mock: bool = False

    @abstractmethod
    def describe(self) -> ProviderStatus:
        """返回 Provider 状态（模型名 / 是否配置成功 / 原因），不得包含密钥。"""

    @abstractmethod
    async def health_check(self) -> dict[str, Any]:
        """探测可用性：返回 {ok, code, message, elapsedMs}，不抛异常。"""

    @abstractmethod
    async def parse_intent(self, messages: list[dict[str, str]], schema: dict[str, Any]) -> LLMChatResult:
        """把自然语言需求解析成结构化 JSON（原始文本，Schema 校验由网关负责）。"""

    @abstractmethod
    async def generate_explanation(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        """基于确定性证据生成一条匹配理由。"""

    @abstractmethod
    async def generate_icebreakers(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        """基于共同歌曲与同行目的生成破冰问题。"""