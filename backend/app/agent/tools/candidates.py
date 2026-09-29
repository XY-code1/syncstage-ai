"""工具 4 / 5：检索同场候选人、执行安全硬约束。

候选人 = TME 音乐画像（通过 TMEDataProvider）+ 产品侧社交偏好（app.agent.social）。
两条链路都不允许绕过。
"""

from __future__ import annotations

from typing import Any

from app.agent.scoring import CandidateFacts, build_facts, check_hard_constraints
from app.agent.social import SocialProfile, load_social_profile
from app.agent.state import ExcludedCandidate, ParsedIntent
from app.agent.tools.registry import ToolContext, ToolResult
from app.db import get_user
from app.integrations.base import EventContext


def search(ctx: ToolContext, event_id: str = '', limit: int = 40) -> ToolResult:
    target = event_id or ctx.state.event_id
    event: EventContext | None = ctx.cache.get('event') or ctx.provider.get_event_context(target)
    if event is None:
        return ToolResult(
            payload=None,
            input_summary='event_id=' + target,
            output_summary='没有找到这场演出，无法检索同场观众',
            status='error',
        )
    ctx.cache['event'] = event

    candidates: list[CandidateFacts] = []
    skipped = 0
    for user_id in event.attendee_user_ids[:limit]:
        music = ctx.provider.get_user_music_profile(user_id)
        social = load_social_profile(user_id)
        if music is None or social is None:
            skipped += 1
            continue
        extra: dict[str, Any] = get_user(user_id) or {}
        candidates.append(build_facts(music, social, extra))

    ctx.cache['candidates'] = candidates
    ctx.state.candidate_ids = [item.user_id for item in candidates]

    summary = '同场候选池 ' + str(len(candidates)) + ' 人'
    if skipped:
        summary += '（' + str(skipped) + ' 人数据不完整已跳过）'
    summary += '：' + '、'.join(item.nickname for item in candidates[:4]) + ('…' if len(candidates) > 4 else '')
    return ToolResult(
        payload=candidates,
        input_summary='event_id=' + target + '，同场观众 ' + str(len(event.attendee_user_ids)) + ' 人',
        output_summary=summary,
        status='ok',
    )


def apply_safety(
    ctx: ToolContext,
    viewer: CandidateFacts,
    viewer_social: SocialProfile,
    intent: ParsedIntent,
    candidates: list[CandidateFacts],
) -> ToolResult:
    event_id = ctx.state.event_id
    if not intent.age_band:
        # 用户没有明说年龄要求时，默认按"和你自己同一个年龄段（±1 段）"处理
        intent.age_band = viewer.age_band
    kept: list[CandidateFacts] = []
    excluded: list[ExcludedCandidate] = []

    for candidate in candidates:
        reason = check_hard_constraints(viewer, viewer_social, intent, candidate, event_id)
        if reason is None:
            kept.append(candidate)
        else:
            excluded.append(reason)

    ctx.cache['kept'] = kept
    ctx.state.candidate_ids = [item.user_id for item in kept]
    ctx.state.excluded_candidates = excluded

    by_rule: dict[str, int] = {}
    for item in excluded:
        by_rule[item.rule] = by_rule.get(item.rule, 0) + 1
    detail = '，'.join(rule + ' ' + str(count) + ' 人' for rule, count in by_rule.items()) or '没有被排除的人'

    return ToolResult(
        payload={'kept': kept, 'excluded': excluded},
        input_summary='候选 ' + str(len(candidates)) + ' 人，硬条件：同场 / 年龄 ' + (intent.age_band or '不限')
                   + ' / ' + ('性别相同' if intent.same_gender_only else '性别不限')
                   + ' / ' + str(intent.group_size) + ' 人 / ' + ('需要线下见面' if intent.meet_in_person else '可只在线上')
                   + ' / 未拉黑举报',
        output_summary='通过 ' + str(len(kept)) + ' 人，排除 ' + str(len(excluded)) + ' 人（' + detail + '）',
        status='ok',
    )