"""工具 8：generate_grounded_reason —— 生成"有证据"的推荐理由。

硬约束：理由里的歌名、歌手、目的、安全项只能来自 evidence 里真实存在的条目。
校验不通过时，直接退化成只引用第一条证据的短句，绝不编造。
"""

from __future__ import annotations

import re
from typing import Any

from app.agent.tools.registry import ToolContext, ToolResult

QUOTE_PATTERN = re.compile(r'《([^》]+)》|「([^」]+)」')

CLOSING = {
    'high': '可以先在公开集合点碰头，再决定要不要一起进场。',
    'mid': '可以先在集合点聊两句，合适再一起候场。',
    'low': '共同点不算多，如果对方的理由打动了你也可以聊聊看。',
}

PREFERRED = ('expected', 'intent_song', 'purpose', 'artist', 'recent', 'tag', 'safety')


def unsupported_quotes(reason: str, evidence: list[dict[str, Any]]) -> list[str]:
    """找出理由里出现、但证据里并不存在的被引用项。"""

    allowed: set[str] = set()
    for entry in evidence:
        allowed.update(entry.get('items') or [])
        allowed.add(entry['text'])
    missing: list[str] = []
    for first, second in QUOTE_PATTERN.findall(reason):
        token = first or second
        if token and token not in allowed:
            missing.append(token)
    return missing


def reason_for(item: dict[str, Any]) -> str:
    evidence = item.get('evidence') or []
    if not evidence:
        return ''

    ordered = sorted(evidence, key=lambda entry: PREFERRED.index(entry['kind']) if entry['kind'] in PREFERRED else 99)
    parts = [ordered[0]['text']]
    for entry in ordered[1:]:
        if entry['kind'] in ('song', 'expected', 'intent_song', 'purpose'):
            parts.append(entry['text'])
        if len(parts) >= 3:
            break

    reason = '；'.join(parts) + '。' + CLOSING.get(item['band'], CLOSING['low'])
    if unsupported_quotes(reason, evidence):
        reason = ordered[0]['text'] + '。' + CLOSING.get(item['band'], CLOSING['low'])
    if unsupported_quotes(reason, evidence):
        reason = CLOSING.get(item['band'], CLOSING['low'])
    return reason


def run(ctx: ToolContext, ranked: list[dict[str, Any]]) -> ToolResult:
    grounded = 0
    dropped = 0
    for item in ranked:
        reason = reason_for(item)
        if reason:
            item['matchReason'] = reason
            grounded += 1
        else:
            item['matchReason'] = ''
            dropped += 1

    top = next((item for item in ranked if item['matchReason']), None)
    ctx.state.ranked_candidates = ranked
    ctx.state.pending_confirmation = {
        'required': True,
        'status': 'awaiting_user',
        'reason': '需要你先确认想邀请谁，对方同意后才会创建临时房间',
        'candidateId': top['userId'] if top else None,
        'nextAction': 'invite',
    }
    if ctx.state.status != 'no_match':
        ctx.state.status = 'pending_confirmation'

    summary = '为 ' + str(grounded) + ' 位候选人生成了带证据的推荐理由'
    if dropped:
        summary += '，' + str(dropped) + ' 位因为没有共同点证据而不生成理由'
    if top:
        summary += '；推荐首位：' + top['candidate']['nickname'] + '（' + str(top['score']) + ' 分）'
    return ToolResult(
        payload=ranked,
        input_summary='对 ' + str(len(ranked)) + ' 位候选人的 evidence 做引用校验',
        output_summary=summary,
        status='ok',
    )