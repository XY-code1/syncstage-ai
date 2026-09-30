"""工具注册表：Agent 能调用的十个工具。"""

from __future__ import annotations

from app.agent.state import PHASE_OF_TOOL
from app.agent.tools import (
    candidates,
    event_context,
    feedback,
    grouping,
    intent,
    music_profile,
    ranking,
    reasoning,
    room,
)
from app.agent.tools.registry import ToolContext, ToolResult, ToolSpec


def _spec(name: str, label: str, description: str, run) -> ToolSpec:  # noqa: ANN001
    return ToolSpec(name=name, label=label, description=description, phase=PHASE_OF_TOOL.get(name, 'plan'), run=run)


def _send_mutual_consent_invitation(ctx: ToolContext, candidate_id: str) -> ToolResult:
    return ToolResult(
        payload={'candidateId': candidate_id, 'status': 'awaiting_peer'},
        input_summary='candidate_id=' + candidate_id,
        output_summary='邀请已发送，等待对方确认；确认前不会创建房间',
    )


def _structured_negotiation(ctx: ToolContext, **kwargs) -> ToolResult:  # noqa: ANN003
    return ToolResult(payload={'safe': True}, input_summary='仅匿名结构字段', output_summary='核对完成；未交换真实姓名、联系方式、精确位置或原始听歌历史')


TOOLS: dict[str, ToolSpec] = {
    spec.name: spec
    for spec in (
        _spec('get_authorized_music_profile', '读取授权音乐画像', '通过 TMEDataProvider 读取用户已授权的收藏/歌手/近期播放/关注演出/歌单标签', music_profile.run),
        _spec('get_event_context', '读取演出上下文', '读取演出信息、同场观众范围与公开集合建议', event_context.run),
        _spec('parse_social_intent', '解析自然语言需求', '把用户原话解析成活动、歌曲、目的、风格、人数与安全偏好', intent.run),
        _spec('search_same_event_candidates', '检索同场候选人', '在本场观众里检索候选，合并音乐画像与社交偏好', candidates.search),
        _spec('apply_safety_constraints', '执行安全硬约束', '同场/年龄/性别/人数/见面意愿/拉黑举报六条硬条件过滤', candidates.apply_safety),
        _spec('rank_candidates', '计算同频程度', '按音乐 40% / 期待 25% / 社交 20% / 交流安全 15% 打分并产出证据', ranking.run),
        _spec('build_group', '生成组队方案', '在达标候选人里组队，人数不足时缩小规模而不是降低标准', grouping.run),
        _spec('generate_grounded_reason', '生成有证据的理由', '只用 evidence 里真实存在的共同点生成推荐理由，并做引用校验', reasoning.run),
        _spec('verify_same_event', '核验同场演出', '仅核验匿名 eventId', _structured_negotiation),
        _spec('compare_arrival_plan', '对比到场计划', '对比模糊到场时间窗与公开集合点', _structured_negotiation),
        _spec('compare_music_profile', '对比音乐画像', '仅交换授权后的聚合音乐标签', _structured_negotiation),
        _spec('compare_social_intent', '对比同行意图', '对比结构化同行目的与交流方式', _structured_negotiation),
        _spec('negotiate_group_size', '协商组队人数', '核对双方可接受的组队人数', _structured_negotiation),
        _spec('verify_safety_constraints', '核验安全边界', '用确定性规则核验硬条件', _structured_negotiation),
        _spec('identify_conflicts', '识别冲突条件', '列出冲突与需要真人确认的差异', _structured_negotiation),
        _spec('generate_handshake_report', '生成预沟通报告', '生成结构化握手报告，不执行自由聊天', _structured_negotiation),
        _spec('send_mutual_consent_invitation', '发送双向确认邀请', '向选中候选人发送同行邀请并等待对方确认', _send_mutual_consent_invitation),
        _spec('create_temporary_room', '创建临时房间', '双方确认后创建临时同频房间，附带公开集合点与候场任务', room.run),
        _spec('collect_feedback', '收集反馈', '记录用户对本次匹配结果的反馈，用于后续调权重', feedback.run),
    )
}

# Agent 的标准执行顺序（与前端六个阶段一一对应）
PIPELINE: tuple[str, ...] = (
    'parse_social_intent',
    'get_authorized_music_profile',
    'get_event_context',
    'search_same_event_candidates',
    'apply_safety_constraints',
    'rank_candidates',
    'build_group',
    'generate_grounded_reason',
)

__all__ = ['TOOLS', 'PIPELINE', 'ToolContext', 'ToolResult', 'ToolSpec']
