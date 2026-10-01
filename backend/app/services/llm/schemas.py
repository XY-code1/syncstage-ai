"""大模型结构化输出的 Schema 定义与校验。

职责边界：
- 模型只负责：把自然语言解析成结构化条件 / 写匹配理由 / 写破冰问题；
- 这里负责：把模型输出校验成确定性代码可以安全消费的形状；
- 候选人检索、安全过滤、评分、排序、双向确认全部由本地确定性代码完成，
  模型输出里的任何候选人 / 演出 / 歌名都不允许凭空出现（见 grounded_guard）。

校验失败一律抛 LLM_SCHEMA_INVALID，由网关决定"最多重试一次"还是直接失败。
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .errors import LLM_SCHEMA_INVALID, LLMError

AGE_BANDS = ('18-22', '23-26', '27-30', '31+')

# 结构化意图的合法取值：与 app/agent/tools/intent.py 的关键词表保持同一集合，
# tests/test_llm_gateway.py::test_taxonomy_stays_in_sync 会守住这条约束，
# 避免"提示词允许的取值"和"工具层认得的取值"悄悄漂移。
PURPOSE_VALUES = ('一起排队候场', '副歌一起唱', '演出后聊音乐', '安静听完整场', '拍照记录现场')
STYLE_VALUES = ('安静听歌', '温和慢热', '热情外放')
SAFETY_VALUES = (
    '只在公开场合见面',
    '不交换私人联系方式',
    '希望同行者性别相同',
    '结伴入场与离场',
    '先在群里聊熟再见面',
    '不接受临时改约',
)

# ---- Schema 声明（同时作为提示词里的"必须遵守的输出契约"）----

PARSED_INTENT_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'required': [
        'concertId',
        'groupSize',
        'musicPreferences',
        'socialIntent',
        'meetingPreference',
        'safetyConstraints',
        'confidence',
    ],
    'properties': {
        'concertId': 'string  # 必须原样回填用户请求里的 eventId，不许编造',
        'groupSize': 'integer 2..4  # 想和几个人一起去',
        'musicPreferences': 'string[]  # 用户明确提到的歌手 / 歌名 / 曲风，没提到就是空数组',
        'socialIntent': 'string  # 一句话概括用户的同行目的',
        'meetingPreference': 'string  # 线上先聊 / 现场碰头 / 一起进场 等',
        'safetyConstraints': 'string[]  # 取值仅限：' + '/'.join(SAFETY_VALUES),
        'confidence': 'number 0..1  # 你对这次解析的把握',
        # 以下字段可选，用于驱动确定性匹配（缺失时保持规则解析结果）
        'purposes': 'string[]?  # 取值仅限：' + '/'.join(PURPOSE_VALUES),
        'chatStyle': 'string?  # 取值仅限：' + '/'.join(STYLE_VALUES),
        'sameGenderOnly': 'boolean?',
        'meetInPerson': 'boolean?',
        'ageBand': 'string?  # 取值仅限：' + '/'.join(AGE_BANDS),
        'note': 'string?  # 一句话中文说明你的理解',
    },
}

EXPLANATION_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'required': ['reason'],
    'properties': {
        'reason': 'string  # 不超过 80 字的中文匹配理由，只能引用给定的共同歌曲 / 常听歌手 / 安全条件',
        'confidence': 'number? 0..1',
    },
}

ICEBREAKER_SCHEMA: dict[str, Any] = {
    'type': 'object',
    'required': ['questions'],
    'properties': {
        'questions': 'string[]  # 3..6 条中文破冰问题，每条不超过 40 字，不提隐私',
    },
}


@dataclass
class ParsedIntentPayload:
    """校验通过后的结构化需求（前端与工具层共用）。"""

    concert_id: str
    group_size: int
    music_preferences: list[str] = field(default_factory=list)
    social_intent: str = ''
    meeting_preference: str = ''
    safety_constraints: list[str] = field(default_factory=list)
    confidence: float = 0.0
    purposes: list[str] = field(default_factory=list)
    chat_style: str = ''
    same_gender_only: bool | None = None
    meet_in_person: bool | None = None
    age_band: str = ''
    note: str = ''

    def to_dict(self) -> dict[str, Any]:
        return {
            'concertId': self.concert_id,
            'groupSize': self.group_size,
            'musicPreferences': list(self.music_preferences),
            'socialIntent': self.social_intent,
            'meetingPreference': self.meeting_preference,
            'safetyConstraints': list(self.safety_constraints),
            'confidence': self.confidence,
            'purposes': list(self.purposes),
            'chatStyle': self.chat_style,
            'sameGenderOnly': self.same_gender_only,
            'meetInPerson': self.meet_in_person,
            'ageBand': self.age_band,
            'note': self.note,
        }

    def to_agent_payload(self) -> dict[str, Any]:
        """转成 app.agent.tools.intent._merge_model 认得的字段名。"""

        return {
            'mentionedSongs': [item for item in self.music_preferences if item],
            'purposes': list(self.purposes),
            'chatStyle': self.chat_style,
            'groupSize': self.group_size,
            'sameGenderOnly': self.same_gender_only,
            'meetInPerson': self.meet_in_person,
            'ageBand': self.age_band,
            'safety': list(self.safety_constraints),
            'note': self.note,
        }


def _invalid(problems: list[str]) -> LLMError:
    return LLMError(
        LLM_SCHEMA_INVALID,
        '大模型返回的 JSON 不符合约定的 Schema',
        hint='这通常是提示词或模型能力问题；已按约定最多重试一次，仍失败则不会使用该结果',
        detail='；'.join(problems[:6]),
    )


def _str_list(value: Any, *, allowed: tuple[str, ...] | None = None) -> list[str] | None:
    if not isinstance(value, list):
        return None
    items = [str(item).strip() for item in value if isinstance(item, str) and str(item).strip()]
    if allowed is not None:
        items = [item for item in items if item in allowed]
    return items


def validate_parsed_intent(payload: Any) -> ParsedIntentPayload:
    """校验 parse_intent 的输出；任何必填字段缺失/类型不对都抛 LLM_SCHEMA_INVALID。"""

    if not isinstance(payload, dict):
        raise _invalid(['顶层不是 JSON object'])

    problems: list[str] = []

    concert_id = payload.get('concertId')
    if not isinstance(concert_id, str) or not concert_id.strip():
        problems.append('concertId 必须是非空字符串')

    group_size = payload.get('groupSize')
    if not isinstance(group_size, int) or isinstance(group_size, bool) or not (2 <= group_size <= 8):
        problems.append('groupSize 必须是 2..8 的整数')
        group_size = 0

    prefs = _str_list(payload.get('musicPreferences'))
    if prefs is None:
        problems.append('musicPreferences 必须是字符串数组（字段必填）')

    social_intent = payload.get('socialIntent')
    if not isinstance(social_intent, str):
        problems.append('socialIntent 必须是字符串')

    meeting = payload.get('meetingPreference')
    if not isinstance(meeting, str):
        problems.append('meetingPreference 必须是字符串')

    safety = _str_list(payload.get('safetyConstraints'))
    if safety is None:
        problems.append('safetyConstraints 必须是字符串数组（字段必填）')

    confidence = payload.get('confidence')
    if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
        problems.append('confidence 必须是 0..1 的数字')
        confidence = 0.0
    else:
        confidence = max(0.0, min(1.0, float(confidence)))

    if problems:
        raise _invalid(problems)

    same_gender = payload.get('sameGenderOnly')
    meet_in_person = payload.get('meetInPerson')
    style = payload.get('chatStyle')
    band = payload.get('ageBand')
    note = payload.get('note')

    return ParsedIntentPayload(
        concert_id=concert_id.strip(),
        group_size=int(group_size),
        music_preferences=prefs or [],
        social_intent=social_intent.strip(),
        meeting_preference=meeting.strip(),
        safety_constraints=safety or [],
        confidence=confidence,
        purposes=_str_list(payload.get('purposes'), allowed=PURPOSE_VALUES) or [],
        chat_style=style if isinstance(style, str) and style in STYLE_VALUES else '',
        same_gender_only=same_gender if isinstance(same_gender, bool) else None,
        meet_in_person=meet_in_person if isinstance(meet_in_person, bool) else None,
        age_band=band if isinstance(band, str) and band in AGE_BANDS else '',
        note=note.strip() if isinstance(note, str) else '',
    )


QUOTED_TITLE = re.compile(r'《([^》]{1,40})》')


def validate_explanation(payload: Any, *, allowed_terms: set[str] | None = None) -> dict[str, Any]:
    """校验匹配理由，并做一次"不许编造"的地基检查。

    allowed_terms 是这位候选人真实拥有的共同歌曲 / 常听歌手 / 安全条件；
    理由里出现的《歌名》只要不在这个集合里，就直接判定为编造并拒绝。
    """

    if not isinstance(payload, dict):
        raise _invalid(['顶层不是 JSON object'])
    reason = payload.get('reason')
    if not isinstance(reason, str) or len(reason.strip()) < 4:
        raise _invalid(['reason 必须是不少于 4 个字的字符串'])
    reason = reason.strip()
    if len(reason) > 160:
        raise _invalid(['reason 超过 160 字'])

    if allowed_terms:
        invented = [title for title in QUOTED_TITLE.findall(reason) if title not in allowed_terms]
        if invented:
            raise LLMError(
                LLM_SCHEMA_INVALID,
                '大模型编造了候选人资料里不存在的歌曲',
                hint='已拒绝这条理由，页面会退回本地评分给出的可核验理由',
                detail='不存在的歌名：' + '、'.join(invented[:3]),
            )

    confidence = payload.get('confidence')
    return {
        'reason': reason,
        'confidence': max(0.0, min(1.0, float(confidence))) if isinstance(confidence, (int, float)) and not isinstance(confidence, bool) else None,
    }


def validate_icebreakers(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise _invalid(['顶层不是 JSON object'])
    questions = _str_list(payload.get('questions'))
    if not questions:
        raise _invalid(['questions 必须是非空字符串数组'])
    return {'questions': [item[:80] for item in questions[:6]]}
