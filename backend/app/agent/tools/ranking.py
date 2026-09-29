"""工具 6：rank_candidates —— 按四个维度给候选人打同频分。"""

from __future__ import annotations

from app.agent.scoring import CandidateFacts, rank_candidates
from app.agent.state import ParsedIntent
from app.agent.tools.registry import ToolContext, ToolResult


def run(ctx: ToolContext, viewer: CandidateFacts, intent: ParsedIntent, candidates: list[CandidateFacts]) -> ToolResult:
    ranked = rank_candidates(viewer, intent, candidates)
    ctx.state.ranked_candidates = ranked

    # 证据汇总：同一场活动里所有候选人的共同点并集，供前端"Agent 依据"抽屉展示
    seen: set[str] = set()
    evidence: list[dict] = []
    for item in ranked:
        for entry in item['evidence']:
            key = str(entry['kind']) + '|' + entry['text']
            if key in seen:
                continue
            seen.add(key)
            evidence.append({**entry, 'userId': item['userId'], 'nickname': item['candidate']['nickname']})
    ctx.state.evidence = evidence

    top = ranked[0] if ranked else None
    summary = '为 ' + str(len(ranked)) + ' 位候选人打了分'
    if top:
        summary += '，最高分 ' + str(top['score']) + '（' + top['candidate']['nickname'] + '）'
        summary += '，共生成 ' + str(len(top['evidence'])) + ' 条证据'
    return ToolResult(
        payload=ranked,
        input_summary='候选 ' + str(len(candidates)) + ' 人，权重：音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全 15%',
        output_summary=summary,
        status='ok',
    )