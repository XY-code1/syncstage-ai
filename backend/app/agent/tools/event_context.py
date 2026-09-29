"""工具 2：get_event_context —— 读取演出上下文与同场观众范围。"""

from __future__ import annotations

from app.agent.tools.registry import ToolContext, ToolResult


def run(ctx: ToolContext, event_id: str = '') -> ToolResult:
    target = event_id or ctx.state.event_id
    event = ctx.provider.get_event_context(target)
    if event is None:
        return ToolResult(
            payload=None,
            input_summary='event_id=' + target,
            output_summary='没有找到这场演出',
            status='error',
        )

    ctx.cache['event'] = event
    ctx.state.event_id = event.event_id
    return ToolResult(
        payload=event,
        input_summary='event_id=' + target,
        output_summary=(
            event.title + ' · ' + event.artist + ' · ' + event.city + event.venue
            + '；同场标记同频意愿的观众 ' + str(len(event.attendee_user_ids)) + ' 人'
            + '；公开集合点：' + str(event.meeting_point.get('name', '待定'))
        ),
        status='ok',
    )