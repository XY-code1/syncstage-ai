"""MockProvider：明确标注的「本地预设数据模拟」。

- 绝不发起任何网络请求（没有 httpx import）；
- 返回体一律带 is_mock=True / provider='mock'，调用方必须把它标注为
  「Demo 模拟 Agent」，不得冒充真实模型输出；
- 只用于 AGENT_MODE=mock 的初赛 Demo 与单元测试。
"""

from __future__ import annotations

import json
import re
from typing import Any

from .base import LLMChatResult, LLMProvider, ProviderStatus

MOCK_NOTICE = '本地预设数据模拟，未调用任何大模型 API'

_EVENT_ID = re.compile(r'"eventId"\s*:\s*"([^"]+)"')

# 本地预设的破冰问题（不依赖任何外部数据）
PRESET_ICEBREAKERS = [
    '你这次最想听到哪一首？',
    '你打算几点到场馆，要不要一起排队？',
    '散场后走哪个出口比较方便？',
    '要不要先在场馆外的公开区域碰头？',
]


def _event_id_from(messages: list[dict[str, str]]) -> str:
    for message in reversed(messages):
        match = _EVENT_ID.search(message.get('content') or '')
        if match:
            return match.group(1)
    return ''


class MockProvider(LLMProvider):
    """本地预设数据：形状与真实 Provider 完全一致，但不触网。"""

    name = 'mock'
    is_mock = True

    def __init__(self, *, model: str = 'local-preset') -> None:
        self.model = model

    def describe(self) -> ProviderStatus:
        return ProviderStatus(
            name=self.name,
            model=self.model,
            base_url='',
            configured=True,
            is_mock=True,
            timeout_seconds=0.0,
            reason='mock_mode',
        )

    async def health_check(self) -> dict[str, Any]:
        return {
            'ok': True,
            'code': '',
            'message': MOCK_NOTICE,
            'isMock': True,
            'elapsedMs': 0,
        }

    def _result(self, payload: dict[str, Any]) -> LLMChatResult:
        return LLMChatResult(
            text=json.dumps(payload, ensure_ascii=False),
            model=self.model,
            provider=self.name,
            elapsed_ms=0,
            finish_reason='mock',
            usage={},
            is_mock=True,
        )

    async def parse_intent(self, messages: list[dict[str, str]], schema: dict[str, Any]) -> LLMChatResult:
        event_id = _event_id_from(messages)
        return self._result(
            {
                'concertId': event_id,
                'groupSize': 3,
                'musicPreferences': [],
                'socialIntent': '和一个同频的人一起去现场',
                'meetingPreference': '现场公开区域碰头',
                'safetyConstraints': ['只在公开场合见面'],
                'confidence': 0.5,
                'note': MOCK_NOTICE,
            }
        )

    async def generate_explanation(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        candidate = (context or {}).get('candidate') or {}
        shared = candidate.get('sharedSongs') or []
        songs = ('、'.join('《' + str(item) + '》' for item in shared[:2])) or '同场演出的共同兴趣'
        return self._result(
            {
                'reason': '你们都想听 ' + songs + '，观演目的也比较接近，可以一起进场。（' + MOCK_NOTICE + '）',
                'confidence': 0.5,
            }
        )

    async def generate_icebreakers(self, context: dict[str, Any], schema: dict[str, Any]) -> LLMChatResult:
        return self._result({'questions': list(PRESET_ICEBREAKERS)})
