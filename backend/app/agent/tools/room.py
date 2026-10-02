"""工具 9：create_room —— 只在双方确认后创建临时同频房间。

安全约束：没有进入 pending_confirmation、或双方没有都确认时，
该工具会直接拒绝，不会创建房间。
"""

from __future__ import annotations

import time
from typing import Any

from app.agent.scoring import CandidateFacts
from app.agent.social import SocialProfile
from app.agent.tools.registry import ToolContext, ToolResult
from app.content import build_icebreakers, build_room_tasks
from app.db import create_room as persist_room
from app.integrations.base import EventContext


def run(
    ctx: ToolContext,
    partner: CandidateFacts | None,
    viewer_social: SocialProfile,
    viewer_facts: CandidateFacts,
    proposer_confirmed: bool = False,
    peer_confirmed: bool = False,
) -> ToolResult:
    pending = ctx.state.pending_confirmation or {}
    if not pending.get('required'):
        return ToolResult(
            payload=None,
            input_summary='proposer_confirmed=' + str(proposer_confirmed) + '，peer_confirmed=' + str(peer_confirmed),
            output_summary='还没有进入待确认状态，拒绝创建房间',
            status='error',
        )
    if not (proposer_confirmed and peer_confirmed):
        # 只把「仍在等待」的状态压回等待态；declined / expired / cancelled 是终态，
        # 任何一次误触建房都不能把它们复活成 awaiting_peer。
        terminal = ('declined', 'expired', 'cancelled')
        next_status = pending.get('status') if pending.get('status') in terminal else (
            'awaiting_peer' if proposer_confirmed else 'awaiting_user'
        )
        ctx.state.pending_confirmation = {**pending, 'status': next_status}
        return ToolResult(
            payload={'status': 'awaiting_confirmation'},
            input_summary='proposer_confirmed=' + str(proposer_confirmed) + '，peer_confirmed=' + str(peer_confirmed),
            output_summary='双方尚未都确认，房间未创建（必须双向确认）',
            status='skipped',
        )

    event: EventContext | None = ctx.cache.get('event')
    ranked: list[dict[str, Any]] = ctx.state.ranked_candidates
    partner_id = partner.user_id if partner else str(pending.get('candidateId') or '')
    partner_item = next((item for item in ranked if item['userId'] == partner_id), None)

    shared_songs = partner_item['sharedSongs'] if partner_item else []
    concert_payload = {
        'title': event.title if event else '',
        'artist': event.artist if event else '',
        'hot_songs': list(event.hot_tracks) if event else [],
        'meeting_point': dict(event.meeting_point) if event else {},
    }
    icebreakers = build_icebreakers(concert_payload, {'purposes': list(viewer_social.purposes)}, shared_songs)
    tasks = build_room_tasks(concert_payload)

    members: list[dict[str, Any]] = [
        {
            'userId': viewer_facts.user_id,
            'nickname': '你',
            'avatar': {'from': '#31c27c', 'to': '#0d6b45'},
            'isMe': True,
            'role': 'me',
            'confirmed': True,
            'chatStyle': viewer_facts.chat_style,
            'note': '发起人',
        }
    ]
    for index, member in enumerate(ctx.cache.get('group_members') or []):
        if member.get('role') == 'me':
            continue
        members.append(
            {
                'userId': member['userId'],
                'nickname': member['nickname'],
                'avatar': member.get('avatar') or {'from': '#61c8ff', 'to': '#0b1116'},
                'isMe': False,
                'role': 'partner' if index == 0 else 'companion',
                'confirmed': True,
                'chatStyle': member.get('chatStyle') or '温和慢热',
                'note': '对方已确认同行' if index == 0 else '同场小组成员',
            }
        )

    # sessionId 决定 roomId；重复/并发确认只会命中同一主键。
    room_id = 'room-' + ctx.state.session_id[:12]
    payload = {
        'roomId': room_id,
        'concertId': ctx.state.event_id,
        'concertTitle': event.title if event else '',
        'meetingPoint': dict(event.meeting_point) if event else {},
        'members': members,
        'icebreakers': icebreakers,
        'tasks': tasks,
        'sharedSongs': shared_songs,
        'source': '双方确认后由 Agent 自动创建',
        'isDemo': True,
    }
    saved = persist_room(room_id, ctx.state.event_id, payload)

    ctx.state.room_id = room_id
    ctx.state.room = saved
    ctx.state.error = ''
    ctx.state.status = 'room_created'
    ctx.state.pending_confirmation = {**pending, 'status': 'accepted'}

    return ToolResult(
        payload=saved,
        input_summary='partner=' + (partner.nickname if partner else '未指定') + '，双方均已确认',
        output_summary='已创建临时房间 ' + room_id + '：成员 ' + str(len(members)) + ' 人，'
                   + '公开集合点「' + str(payload['meetingPoint'].get('name', '待定')) + '」，'
                   + '破冰问题 ' + str(len(icebreakers)) + ' 条',
        status='ok',
    )
