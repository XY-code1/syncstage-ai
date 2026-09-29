"""工具 7：build_group —— 在通过硬条件的人里尝试组队。

规则：
- 只有同频分 >= 62（中频以上）的人才进入组队池；
- 人数不足时缩小队伍规模（绝不为了凑人数拉低标准，也绝不编造候选人）；
- 一个人都凑不出来时返回 no_match。
"""

from __future__ import annotations

from typing import Any

from app.agent.scoring import CandidateFacts
from app.agent.state import ParsedIntent
from app.agent.tools.registry import ToolContext, ToolResult
from app.integrations.base import EventContext

QUALIFY_MIN_SCORE = 62


def run(ctx: ToolContext, viewer: CandidateFacts, intent: ParsedIntent, ranked: list[dict[str, Any]]) -> ToolResult:
    qualifying = [item for item in ranked if item['score'] >= QUALIFY_MIN_SCORE]
    ctx.cache['qualifying'] = qualifying

    if not qualifying:
        ctx.state.status = 'no_match'
        ctx.state.proposed_group = {}
        ctx.state.pending_confirmation = {
            'required': False,
            'status': 'blocked',
            'reason': '没有任何候选人达到同频阈值 ' + str(QUALIFY_MIN_SCORE) + ' 分',
        }
        return ToolResult(
            payload=None,
            input_summary='候选 ' + str(len(ranked)) + ' 人，同频阈值 ' + str(QUALIFY_MIN_SCORE) + ' 分',
            output_summary='没有达到阈值的候选人，返回 no_match（不编造候选人，也不降低安全标准）',
            status='ok',
        )

    target_size = max(2, min(intent.group_size, len(qualifying) + 1))
    picked = qualifying[: target_size - 1]
    event: EventContext | None = ctx.cache.get('event')

    members: list[dict[str, Any]] = [
        {'userId': viewer.user_id, 'nickname': '你', 'role': 'me', 'score': None}
    ]
    for index, item in enumerate(picked):
        members.append(
            {
                'userId': item['userId'],
                'nickname': item['candidate']['nickname'],
                'role': 'partner' if index == 0 else 'companion',
                'score': item['score'],
            }
        )

    shrunk = len(members) < intent.group_size
    proposed = {
        'size': len(members),
        'requestedSize': intent.group_size,
        'shrunk': shrunk,
        'members': members,
        'qualifyMinScore': QUALIFY_MIN_SCORE,
        'meetingPoint': dict(event.meeting_point) if event else {},
        'meetingNote': '只推荐有工作人员、灯光明亮的公开区域',
        'rationale': (
            '从 ' + str(len(ranked)) + ' 位同频候选人里选出 ' + str(len(picked)) + ' 位，'
            + '最低同频分 ' + str(picked[-1]['score']) + ' 分'
            if picked
            else '暂时只有你一个人符合条件'
        ),
    }
    if shrunk and picked:
        proposed['rationale'] += '；符合条件的人不足 ' + str(intent.group_size) + ' 人，已自动缩小为 ' + str(len(members)) + ' 人小组'

    ctx.state.proposed_group = proposed
    return ToolResult(
        payload=proposed,
        input_summary='期望 ' + str(intent.group_size) + ' 人，候选 ' + str(len(qualifying)) + ' 人达到阈值',
        output_summary='组队方案：' + str(len(members)) + ' 人（'
                   + '、'.join(member['nickname'] for member in members) + '）'
                   + ('，已缩小规模' if shrunk else ''),
        status='ok',
    )