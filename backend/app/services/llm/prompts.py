"""网关提示词。

原则：提示词只描述"如何把已知事实变成 JSON"，并明确禁止编造
候选人 / 演出 / 歌名 / 时间地点；所有事实都由确定性代码通过
messages 或 context 注入。
"""

from __future__ import annotations

import json
from typing import Any

INTENT_SYSTEM_PROMPT = (
    '你是演出同行匹配助手，只做一件事：把用户的一句话需求解析成结构化 JSON。\n'
    '严格输出 JSON，不要输出解释、不要输出 Markdown 代码块。\n'
    '没有提到的字段必须留空数组或空字符串，绝对不要编造歌名、艺人名或演出信息。\n'
    '字段取值只能从给定枚举里挑。'
)

EXPLANATION_SYSTEM_PROMPT = (
    '你是演出同行匹配助手，只做一件事：把已经算好的确定性证据改写成一句中文匹配理由。\n'
    '严格输出 JSON：{"reason": "...", "confidence": 0.0}。\n'
    '硬性约束：\n'
    '1. 事实只能来自 context.evidence 与 context.candidate，context 里没有的一律不许写；\n'
    '2. 只能引用 context 里出现过的共同歌曲、共同期待曲目、共同歌手、共同标签、共同目的与安全条件；\n'
    '3. 提到歌名必须用《》包裹，并且必须是 context 里真实存在的歌名；\n'
    '4. context 里没有共同歌曲时，禁止提到任何歌名，改为描述共同期待、交流节奏或安全边界；\n'
    '5. 不要编造相遇经历、性格、外貌、职业或任何 context 里没有的信息；\n'
    '6. 不超过 80 字，不要输出 Markdown。'
)

ICEBREAKER_SYSTEM_PROMPT = (
    '你是演出现场的破冰助手，只做一件事：围绕给定的共同歌曲与同行目的，'
    '生成可以直接发到群里的中文破冰问题。\n'
    '严格输出 JSON：{"questions": ["...", "..."]}。\n'
    '硬性约束：3 到 6 条；每条不超过 40 字；只提公开、轻松的话题；'
    '不问住址、联系方式、票务验证码等隐私；不要编造 context 里没有的歌名。'
)


def build_intent_messages(text: str, event_id: str, schema: dict[str, Any], extra: dict[str, Any] | None = None) -> list[dict[str, str]]:
    payload = {
        'text': text,
        'eventId': event_id,
        'schema': schema,
        'hints': extra or {},
    }
    return [
        {'role': 'system', 'content': INTENT_SYSTEM_PROMPT},
        {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)},
    ]


def build_explanation_messages(context: dict[str, Any], schema: dict[str, Any]) -> list[dict[str, str]]:
    payload = {'context': context, 'schema': schema}
    return [
        {'role': 'system', 'content': EXPLANATION_SYSTEM_PROMPT},
        {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)},
    ]


def build_icebreaker_messages(context: dict[str, Any], schema: dict[str, Any]) -> list[dict[str, str]]:
    payload = {'context': context, 'schema': schema}
    return [
        {'role': 'system', 'content': ICEBREAKER_SYSTEM_PROMPT},
        {'role': 'user', 'content': json.dumps(payload, ensure_ascii=False)},
    ]