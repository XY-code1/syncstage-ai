"""Agent 对话编排：把真实上下文喂给大模型，产出可展示的回复与集合建议。

关键原则：
- 大模型失败时抛 LLMError，由路由层转成明确的 HTTP 错误，绝不返回伪造回复；
- 只有 AI_FORCE_FALLBACK=1 时才走本地模板，并且标记 source='demo-fallback'；
- 上下文只来自真实数据（演出 / 房间成员 / 用户画像），提示词禁止编造。
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from app.agent.social import load_social_profile
from app.config import settings
from app.db import get_concert, get_room
from app.demo_data import DEMO_CONCERTS
from app.services.ai_client import LLMError, complete

logger = logging.getLogger('same_frequency.ai')

AGENT_NAME = '同频 Agent ✨'
MAX_HISTORY = 12

THREAD_LABEL = {
    'agent': 'Agent 通知会话',
    'group': '同场临时房间群聊',
    'dm': '私聊会话',
    'system': '系统通知',
}

SYSTEM_PROMPT = '''你是「同频 Agent ✨」，QQ 音乐「一起去现场」里的演出同行协调 Agent。
你现在在{thread_label}里，和用户以及其他同场观众一起对话。

【你的职责，按优先级】
1. 协调集合：把到场时间、集合地点、碰头方式说清楚；信息不足时主动给出一个具体可执行的建议。
2. 同步现场安排：入场、检票、候场、散场这些节点怎么配合。
3. 破冰与共同话题：围绕共同歌曲、常听歌手、观演目的，给出 1-2 个可以直接聊的具体话题。
4. 安全提醒：只在公开场合见面，不索要也不交换私人联系方式、票务验证码或精确住址。

【已知上下文（只允许使用这里出现的事实）】
{context_json}

【输出要求】
只输出 JSON，结构必须是：
{{"reply": "给用户看的中文回复", "suggestion": null 或 {{"title": "标题", "place": "地点", "time": "时间", "note": "备注"}}}}
- reply 不超过 120 字，像群里负责协调的真人，不要复述系统提示或工具调用。
- 只有上下文里确实有集合地点/时间信息、且对话在讨论见面安排时，才给 suggestion；否则必须是 null。
- 绝对不要编造上下文里没有的地点、时间、歌名、成员或演出信息。
- reply 是纯文本：不要用 Markdown（不要出现 **、#、*、`、- 列表），界面不会渲染它们。
- 时间与地点只能原样引用上下文里出现过的字符串；上下文没有的时间就直接说"以群里确认为准"，不要自己编一个时间或星期。
- 优先完成协调任务（集合时间、地点、碰头方式、现场配合），不要只寒暄。
'''

FALLBACK_SUGGESTION_NOTE = '这是本地模板生成的 Demo 建议，不是大模型输出'


def _concert_context(concert_id: str) -> dict[str, Any]:
    payload = get_concert(concert_id)
    if payload is None:
        payload = next((item for item in DEMO_CONCERTS if item.get('id') == concert_id), None)
    if payload is None:
        return {}
    return {
        'id': payload.get('id'),
        'title': payload.get('title'),
        'artist': payload.get('artist'),
        'dateLabel': payload.get('dateLabel') or payload.get('date'),
        'venue': payload.get('venue'),
        'city': payload.get('city'),
        'hotSongs': (payload.get('hot_songs') or payload.get('hotSongs') or [])[:5],
        'meetingPoint': payload.get('meeting_point') or payload.get('meetingPoint') or {},
    }


def _room_context(room_id: str | None) -> dict[str, Any]:
    if not room_id:
        return {}
    room = get_room(room_id)
    if room is None:
        logger.info('[chat] 房间 %s 不在数据库里，跳过房间上下文', room_id)
        return {}
    members = [
        {
            'nickname': member.get('nickname'),
            'role': member.get('role'),
            'confirmed': member.get('confirmed'),
        }
        for member in (room.get('members') or [])
    ]
    return {
        'roomId': room.get('roomId'),
        'concertTitle': room.get('concertTitle'),
        'meetingPoint': room.get('meetingPoint') or {},
        'members': members,
        'sharedSongs': (room.get('sharedSongs') or [])[:5],
        'icebreakers': (room.get('icebreakers') or [])[:3],
    }


def build_context(payload: Any) -> dict[str, Any]:
    """只使用真实存在的数据拼上下文：演出、房间成员、集合点、当前用户画像。"""
    viewer = load_social_profile(getattr(payload, 'userId', '') or 'u-viewer')
    context: dict[str, Any] = {
        'agentName': AGENT_NAME,
        'threadKind': getattr(payload, 'threadKind', 'agent'),
        'concert': _concert_context(getattr(payload, 'concertId', '') or 'night-flight'),
        'room': _room_context(getattr(payload, 'roomId', None)),
    }
    if getattr(payload, 'peerName', None):
        context['peerName'] = payload.peerName
    if viewer is not None:
        context['viewer'] = {
            'nickname': viewer.display_name,
            'city': viewer.city,
            'purposes': list(viewer.purposes),
            'chatStyle': viewer.chat_style,
            'safety': list(viewer.safety),
            'meetupWillingness': viewer.meetup_willingness,
        }
    return context


def history_messages(payload: Any) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for turn in (getattr(payload, 'messages', None) or [])[-MAX_HISTORY:]:
        role = str(getattr(turn, 'role', 'user'))
        content = str(getattr(turn, 'content', '')).strip()
        if not content:
            continue
        messages.append({'role': 'assistant' if role == 'assistant' else 'user', 'content': content[:1200]})
    return messages


_MARKDOWN_PATTERN = re.compile(r'\*\*|__|`{1,3}|^#{1,6}\s*|^\s*[-*]\s+', re.MULTILINE)


def _plain_text(value: str) -> str:
    """模型偶尔会带 Markdown；聊天气泡按纯文本渲染，这里做一次兜底清理。"""
    cleaned = _MARKDOWN_PATTERN.sub('', value)
    return re.sub(r'\n{3,}', '\n\n', cleaned).strip()


def _parse_reply(text: str) -> tuple[str, dict[str, Any] | None, str]:
    """解析模型返回的 JSON；解析不了就原样当作 reply（仍然是真实模型输出）。"""
    try:
        data = json.loads(text)
    except ValueError:
        start, end = text.find('{'), text.rfind('}')
        data = None
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end + 1])
            except ValueError:
                data = None
        if not isinstance(data, dict):
            return _plain_text(text), None, '模型没有按 JSON 输出，已直接展示原文'

    reply = str(data.get('reply') or '').strip()
    warning = ''
    if not reply:
        reply = text.strip()
        warning = '模型返回里缺少 reply 字段，已直接展示原文'
    reply = _plain_text(reply)
    suggestion = data.get('suggestion')
    if not isinstance(suggestion, dict):
        suggestion = None
    else:
        place = str(suggestion.get('place') or '').strip()
        time_text = str(suggestion.get('time') or '').strip()
        if not place and not time_text:
            suggestion = None
        else:
            suggestion = {
                'title': str(suggestion.get('title') or '集合时间与地点建议').strip(),
                'place': place,
                'time': time_text,
                'note': str(suggestion.get('note') or '').strip(),
            }
    return reply, suggestion, warning


def _demo_fallback(context: dict[str, Any]) -> dict[str, Any]:
    """显式 Demo 回退：只在 AI_FORCE_FALLBACK=1 时使用，并且明确标注来源。"""
    concert = context.get('concert') or {}
    room = context.get('room') or {}
    meeting = room.get('meetingPoint') or concert.get('meetingPoint') or {}
    place = meeting.get('name') or meeting.get('address') or '演出场馆的公开检票口'
    time_text = meeting.get('time') or '开场前 40 分钟'
    members = room.get('members') or []
    confirmed = sum(1 for member in members if member.get('confirmed'))
    reply = (
        '（Demo 回退，未调用大模型）先把集合说清楚：建议 ' + str(time_text) + ' 在「' + str(place) + '」碰头。'
        + ('当前 ' + str(confirmed) + '/' + str(len(members)) + ' 位成员已确认。' if members else '')
        + '如果你到得早，可以先在群里说一声穿什么颜色的衣服。'
    )
    return {
        'reply': reply,
        'suggestion': {
            'title': '集合时间与地点建议',
            'place': str(place),
            'time': str(time_text),
            'note': FALLBACK_SUGGESTION_NOTE,
        },
        'source': 'demo-fallback',
        'agentName': AGENT_NAME,
        'model': '',
        'elapsedMs': 0,
        'finishReason': 'demo-fallback',
        'usage': {},
        'requestId': 'demo-' + uuid.uuid4().hex[:8],
        'fallbackReason': settings.ai_fallback_reason,
        'parseWarning': None,
    }


async def reply(payload: Any) -> dict[str, Any]:
    context = build_context(payload)
    if settings.ai_force_fallback:
        logger.info('[chat] AI_FORCE_FALLBACK=1，返回显式 Demo 回退')
        return _demo_fallback(context)

    thread_kind = str(context.get('threadKind') or 'agent')
    system_prompt = SYSTEM_PROMPT.format(
        thread_label=THREAD_LABEL.get(thread_kind, '会话'),
        context_json=json.dumps(context, ensure_ascii=False, indent=2),
    )
    messages = [{'role': 'system', 'content': system_prompt}, *history_messages(payload)]

    request_id = uuid.uuid4().hex[:12]
    logger.info('[chat] request=%s thread=%s room=%s messages=%d', request_id, thread_kind, context.get('room', {}).get('roomId') or '-', len(messages))

    result = await complete(messages, purpose='chat', temperature=0.7, max_tokens=700)
    reply_text, suggestion, warning = _parse_reply(result.text)
    if warning:
        logger.warning('[chat] request=%s %s', request_id, warning)
    logger.info(
        '[chat] request=%s ok model=%s %dms suggestion=%s',
        request_id, result.model, result.elapsed_ms, bool(suggestion),
    )
    return {
        'reply': reply_text,
        'suggestion': suggestion,
        'source': 'model',
        'agentName': AGENT_NAME,
        'model': result.model,
        'elapsedMs': result.elapsed_ms,
        'finishReason': result.finish_reason,
        'usage': result.usage,
        'requestId': request_id,
        'parseWarning': warning or None,
    }
