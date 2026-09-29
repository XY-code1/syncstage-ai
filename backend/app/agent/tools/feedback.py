"""工具 10：collect_feedback —— 收集用户对本次 Agent 结果的反馈。"""

from __future__ import annotations

from app.agent.tools.registry import ToolContext, ToolResult
from app.db import create_feedback


def run(ctx: ToolContext, rating: str = 'ok', tags: list[str] | None = None, comment: str = '') -> ToolResult:
    payload = {
        'sessionId': ctx.state.session_id,
        'rating': rating,
        'tags': tags or [],
        'comment': comment,
        'status': ctx.state.status,
        'toolCalls': ctx.state.tool_names(),
    }
    saved = create_feedback(ctx.state.session_id, rating, payload)

    label = {'good': '有帮助', 'neutral': '一般', 'bad': '没帮助'}.get(rating, rating)
    return ToolResult(
        payload=saved,
        input_summary='rating=' + label + '，tags=' + ('、'.join(tags or []) or '无'),
        output_summary='反馈已记录（' + str(saved['id']) + '），会用于后续调整匹配权重',
        status='ok',
    )