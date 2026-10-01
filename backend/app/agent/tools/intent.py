"""工具 3：parse_social_intent —— 把自然语言需求解析成结构化意图。

规则解析永远先跑一遍作为"地板"；配置了大模型时再用模型结果覆盖，
解析失败或超时都回退到规则结果，保证演示不中断。
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.agent.state import ParsedIntent
from app.agent.tools.registry import ToolContext, ToolResult
from app.config import settings
from app.services.ai_client import chat_json_result

PURPOSE_KEYWORDS: dict[str, tuple[str, ...]] = {
    '副歌一起唱': ('副歌', '合唱', '一起唱', '跟着唱', '唱出来', '大合唱'),
    '一起排队候场': ('排队', '候场', '提前到', '一起等', '进场前'),
    '演出后聊音乐': ('散场后', '演出后', '聊音乐', '聊歌', '找个地方', '结束后'),
    '安静听完整场': ('安静', '不想说话', '认真听', '不聊天', '别说话'),
    '拍照记录现场': ('拍照', '摄影', '照片', '拍一张', '出片', '相机'),
}

STYLE_KEYWORDS: dict[str, tuple[str, ...]] = {
    '安静听歌': ('安静', '社恐', '不想聊天', '不说话', '内向', '别理我', '只听歌'),
    '温和慢热': ('慢热', '先聊', '慢慢', '温和', '不熟', '聊两句', '循序渐进'),
    '热情外放': ('热情', '外放', '健谈', '爱聊', '话多', '活跃', '自来熟'),
}

SAFETY_KEYWORDS: dict[str, tuple[str, ...]] = {
    '只在公开场合见面': ('公开场合', '人多的地方', '灯光明亮', '安全的地方', '大厅'),
    '不交换私人联系方式': ('不交换', '不加微信', '不要联系方式', '别问联系方式', '隐私'),
    '希望同行者性别相同': ('同性', '性别相同', '只要女生', '只要男生', '女生一起', '男生一起', '同性同行'),
    '结伴入场与离场': ('一起进场', '一起走', '结伴', '一起离场', '一起检票', '一起到地铁'),
    '先在群里聊熟再见面': ('先聊熟', '先聊几次', '聊熟悉', '先聊聊'),
    '不接受临时改约': ('不要临时', '别放鸽子', '不放鸽子', '守约', '别改时间'),
}

MEETUP_YES = ('见面', '线下', '一起进', '集合', '碰头', '到场', '一起走', '约在')
MEETUP_NO = ('不见面', '不线下', '只在线上', '房间聊就行', '不用见面', '别见面')

GROUP_PATTERNS = (
    (r'(?:两|2)\s*[个位]?\s*人', 2),
    (r'(?:三|3)\s*[个位]?\s*人', 3),
    (r'(?:四|4)\s*[个位]?\s*人', 4),
    (r'一对(?:一|1)', 2),
)

INTENT_SYSTEM_PROMPT = (
    '你是演出同行匹配助手。请把用户的一句话需求解析成 JSON，不要输出解释。'
    '字段：mentionedSongs（字符串数组，只能是用户明确说出的歌名）、'
    'purposes（数组，取值仅限：一起排队候场/副歌一起唱/演出后聊音乐/安静听完整场/拍照记录现场）、'
    'chatStyle（热情外放/温和慢热/安静听歌）、groupSize（2/3/4 的整数）、'
    'sameGenderOnly（布尔）、meetInPerson（布尔）、ageBand（18-22/23-26/27-30/31+ 之一或空）、'
    'safety（数组，取值仅限：只在公开场合见面/不交换私人联系方式/希望同行者性别相同/结伴入场与离场/先在群里聊熟再见面/不接受临时改约）、'
    'note（一句话中文说明你的理解）。没有提到的字段不要编造。'
)


def _match_first(text: str, table: dict[str, tuple[str, ...]]) -> list[str]:
    hits: list[str] = []
    for label, keywords in table.items():
        if any(keyword in text for keyword in keywords):
            hits.append(label)
    return hits


def _parse_group_size(text: str, default: int) -> int:
    for pattern, size in GROUP_PATTERNS:
        if re.search(pattern, text):
            return size
    return default


def rule_parse(
    text: str,
    ctx: ToolContext,
    event_id: str,
    viewer_gender: str,
    viewer_age_band: str,
) -> ParsedIntent:
    """确定性规则解析，永远可用。"""

    body = (text or '').strip()
    purposes = _match_first(body, PURPOSE_KEYWORDS)
    safety = _match_first(body, SAFETY_KEYWORDS)

    styles = _match_first(body, STYLE_KEYWORDS)
    chat_style = styles[0] if styles else '温和慢热'

    me_gender = viewer_gender if viewer_gender in {'female', 'male'} else 'prefer-not-to-say'
    same_gender_only = '希望同行者性别相同' in safety
    if '只要女生' in body or '女生一起' in body:
        same_gender_only = True
        me_gender = 'female'
    if '只要男生' in body or '男生一起' in body:
        same_gender_only = True
        me_gender = 'male'

    meet_in_person = True
    if any(keyword in body for keyword in MEETUP_NO):
        meet_in_person = False
    elif any(keyword in body for keyword in MEETUP_YES):
        meet_in_person = True

    event = ctx.cache.get('event') or ctx.provider.get_event_context(event_id)
    mentioned_songs: list[str] = []
    mentioned_artists: list[str] = []
    if event is not None:
        for track in ctx.provider.search_tracks(body):
            if track.title not in mentioned_songs:
                mentioned_songs.append(track.title)
            if track.artist not in mentioned_artists:
                mentioned_artists.append(track.artist)
        if event.artist in body and event.artist not in mentioned_artists:
            mentioned_artists.append(event.artist)

    age_band = ''
    if any(keyword in body for keyword in ('同龄', '差不多大', '年龄相近', '年纪相仿')):
        age_band = viewer_age_band
    if '大学生' in body or '学生' in body:
        age_band = '18-22'

    return ParsedIntent(
        event_id=event_id,
        mentioned_songs=mentioned_songs,
        mentioned_artists=mentioned_artists,
        purposes=purposes,
        chat_style=chat_style,
        group_size=_parse_group_size(body, 3),
        same_gender_only=same_gender_only,
        me_gender=me_gender,
        meet_in_person=meet_in_person,
        age_band=age_band or viewer_age_band,
        strict=any(keyword in body for keyword in ('严格', '完全一样', '必须同岁', '一模一样')),
        safety=safety,
        note='规则解析：从你的原话里识别出 ' + str(len(purposes)) + ' 个目的、' + str(len(mentioned_songs)) + ' 首歌',
    )


def _merge_model(parsed: ParsedIntent, payload: dict[str, Any]) -> ParsedIntent:
    """模型结果覆盖规则结果，但只接受合法取值，避免模型编造出体系外的标签。"""

    songs = [item for item in payload.get('mentionedSongs') or [] if isinstance(item, str) and item.strip()]
    if songs:
        parsed.mentioned_songs = songs
    purposes = [item for item in payload.get('purposes') or [] if item in PURPOSE_KEYWORDS]
    if purposes:
        parsed.purposes = purposes
    style = payload.get('chatStyle')
    if style in STYLE_KEYWORDS:
        parsed.chat_style = style
    size = payload.get('groupSize')
    if isinstance(size, int) and size in (2, 3, 4):
        parsed.group_size = size
    if isinstance(payload.get('sameGenderOnly'), bool):
        parsed.same_gender_only = payload['sameGenderOnly']
    if isinstance(payload.get('meetInPerson'), bool):
        parsed.meet_in_person = payload['meetInPerson']
    safety = [item for item in payload.get('safety') or [] if item in SAFETY_KEYWORDS]
    if safety:
        parsed.safety = safety
    band = payload.get('ageBand')
    if band in {'18-22', '23-26', '27-30', '31+'}:
        parsed.age_band = band
    note = payload.get('note')
    if isinstance(note, str) and note.strip():
        parsed.note = '模型解析：' + note.strip()[:60]
    return parsed


async def run(
    ctx: ToolContext,
    text: str = '',
    event_id: str = '',
    viewer_gender: str = 'prefer-not-to-say',
    viewer_age_band: str = '',
    force_fallback: bool = False,
    override: dict[str, Any] | None = None,
) -> ToolResult:
    body = text or ctx.state.raw_intent
    ctx.state.raw_intent = body

    parsed = rule_parse(body, ctx, event_id or ctx.state.event_id, viewer_gender, viewer_age_band)
    if override:
        # 用户在"确认 Agent 理解结果"页改过的字段以用户为准
        parsed = _merge_model(parsed, override)
        parsed.note = '已采用你在确认页上修正后的结构化意图'

    used_fallback = True
    status = 'fallback'
    note = '大模型未启用，使用本地规则解析（' + settings.ai_fallback_reason + '）'
    if force_fallback:
        note = '本次演示指定"大模型不可用"，直接使用本地规则解析（fallback）'

    if settings.ai_enabled and not force_fallback:
        call = await chat_json_result(
            INTENT_SYSTEM_PROMPT,
            json.dumps({'text': body, 'eventId': parsed.event_id}, ensure_ascii=False),
            purpose='intent',
        )
        if isinstance(call.payload, dict):
            parsed = _merge_model(parsed, call.payload)
            used_fallback = False
            status = 'ok'
            elapsed = call.result.elapsed_ms if call.result else 0
            note = '大模型解析成功（' + str(elapsed) + 'ms）'
        else:
            reason = call.error.code if call.error else 'bad_response'
            note = '大模型调用失败（' + reason + '），已回退到本地规则解析'

    ctx.state.parsed_intent = parsed
    ctx.state.status = 'intent_parsed'

    summary = (
        '活动：' + (parsed.event_id or '未指定')
        + '；歌曲：' + ('、'.join(parsed.mentioned_songs[:3]) if parsed.mentioned_songs else '未点名')
        + '；目的：' + ('、'.join(parsed.purposes) if parsed.purposes else '未明确')
        + '；风格：' + parsed.chat_style
        + '；人数：' + str(parsed.group_size)
        + '；性别：' + ('要求同性' if parsed.same_gender_only else '不限')
        + '；见面：' + ('需要线下见面' if parsed.meet_in_person else '可以只在线上')
    )
    return ToolResult(
        payload=parsed,
        input_summary='原话："' + body[:60] + ('…' if len(body) > 60 else '') + '"',
        output_summary=summary + '（' + note + '）',
        status=status,
        used_fallback=used_fallback,
    )