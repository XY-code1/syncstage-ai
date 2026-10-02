"""Agent 状态定义。

状态机：
    collecting_intent -> intent_parsed -> awaiting_user_confirm -> running
        -> pending_confirmation -> room_created
    异常分支：no_match / error

约束：
- 任何"创建房间 / 共享集合点 / 保留联系"的动作都必须先进入 pending_confirmation；
- 只有发起方与受邀方都确认后，create_temporary_room 才允许执行。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

from app.integrations.base import UserMusicProfile

AgentStatus = Literal[
    'collecting_intent',
    'intent_parsed',
    'awaiting_user_confirm',
    'running',
    'pending_confirmation',
    'room_created',
    'no_match',
    'error',
]

ToolStatus = Literal['ok', 'fallback', 'error', 'skipped']

# 六个对外展示的 Agent 阶段（用户模式只显示这些自然语言文案）
AGENT_PHASES: tuple[dict[str, str], ...] = (
    {'id': 'understand', 'label': '理解你的意图', 'detail': '把你的原话拆成活动、歌曲、目的和安全边界'},
    {'id': 'profile', 'label': '读取授权音乐偏好', 'detail': '只读取你授权的那几类 QQ 音乐数据'},
    {'id': 'search', 'label': '检索同场候选人', 'detail': '在这一场的观众里找人，不跨场推荐'},
    {'id': 'safety', 'label': '执行安全约束', 'detail': '按你设的硬条件先筛一遍，不符合的直接排除'},
    {'id': 'rank', 'label': '计算同频程度', 'detail': '音乐偏好、演出期待、社交目的、交流与安全四项打分'},
    {'id': 'plan', 'label': '生成同频方案', 'detail': '给出带证据的推荐理由和公开集合建议'},
)

PHASE_OF_TOOL: dict[str, str] = {
    'parse_social_intent': 'understand',
    'get_authorized_music_profile': 'profile',
    'get_event_context': 'profile',
    'search_same_event_candidates': 'search',
    'apply_safety_constraints': 'safety',
    'rank_candidates': 'rank',
    'build_group': 'plan',
    'generate_grounded_reason': 'plan',
    'send_mutual_consent_invitation': 'plan',
    'create_temporary_room': 'plan',
    'collect_feedback': 'plan',
    'verify_same_event': 'search', 'compare_arrival_plan': 'rank', 'compare_music_profile': 'rank',
    'compare_social_intent': 'rank', 'negotiate_group_size': 'plan', 'verify_safety_constraints': 'safety',
    'identify_conflicts': 'safety', 'generate_handshake_report': 'plan',
}


@dataclass
class ToolTraceRecord:
    """一次工具调用的可核验记录（评委模式展示）。"""

    name: str
    label: str
    phase: str
    status: ToolStatus = 'ok'
    input_summary: str = ''
    output_summary: str = ''
    duration_ms: int = 0
    used_fallback: bool = False
    error: str = ''

    def to_dict(self) -> dict[str, Any]:
        return {
            'name': self.name,
            'label': self.label,
            'phase': self.phase,
            'status': self.status,
            'inputSummary': self.input_summary,
            'outputSummary': self.output_summary,
            'durationMs': self.duration_ms,
            'usedFallback': self.used_fallback,
            'error': self.error,
        }


@dataclass
class ExcludedCandidate:
    """被硬条件排除的候选人（必须给出可核验的规则与原因）。"""

    user_id: str
    nickname: str
    rule: str
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            'userId': self.user_id,
            'nickname': self.nickname,
            'rule': self.rule,
            'reason': self.reason,
        }


@dataclass
class ParsedIntent:
    """自然语言需求的解析结果。"""

    event_id: str = ''
    mentioned_songs: list[str] = field(default_factory=list)
    mentioned_artists: list[str] = field(default_factory=list)
    purposes: list[str] = field(default_factory=list)
    chat_style: str = '温和慢热'
    group_size: int = 3
    same_gender_only: bool = False
    me_gender: str = 'prefer-not-to-say'
    meet_in_person: bool = True
    age_band: str = ''
    strict: bool = False
    safety: list[str] = field(default_factory=list)
    note: str = ''

    def to_dict(self) -> dict[str, Any]:
        return {
            'eventId': self.event_id,
            'mentionedSongs': self.mentioned_songs,
            'mentionedArtists': self.mentioned_artists,
            'purposes': self.purposes,
            'chatStyle': self.chat_style,
            'groupSize': self.group_size,
            'sameGenderOnly': self.same_gender_only,
            'meGender': self.me_gender,
            'meetInPerson': self.meet_in_person,
            'ageBand': self.age_band,
            'strict': self.strict,
            'safety': self.safety,
            'note': self.note,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> 'ParsedIntent':
        return cls(
            event_id=str(payload.get('eventId') or payload.get('event_id') or ''),
            mentioned_songs=list(payload.get('mentionedSongs') or []),
            mentioned_artists=list(payload.get('mentionedArtists') or []),
            purposes=list(payload.get('purposes') or []),
            chat_style=str(payload.get('chatStyle') or '温和慢热'),
            group_size=int(payload.get('groupSize') or 3),
            same_gender_only=bool(payload.get('sameGenderOnly')),
            me_gender=str(payload.get('meGender') or 'prefer-not-to-say'),
            meet_in_person=bool(payload.get('meetInPerson', True)),
            age_band=str(payload.get('ageBand') or ''),
            strict=bool(payload.get('strict')),
            safety=list(payload.get('safety') or []),
            note=str(payload.get('note') or ''),
        )


@dataclass
class AgentState:
    """Agent 的完整状态（可序列化，前端刷新后可恢复）。"""

    session_id: str
    user_id: str = 'u-viewer'
    event_id: str = ''
    raw_intent: str = ''
    parsed_intent: ParsedIntent | None = None
    music_profile: UserMusicProfile | None = None
    candidate_ids: list[str] = field(default_factory=list)
    excluded_candidates: list[ExcludedCandidate] = field(default_factory=list)
    ranked_candidates: list[dict[str, Any]] = field(default_factory=list)
    proposed_group: dict[str, Any] = field(default_factory=dict)
    evidence: list[dict[str, Any]] = field(default_factory=list)
    pending_confirmation: dict[str, Any] = field(default_factory=dict)
    room_id: str | None = None
    room: dict[str, Any] = field(default_factory=dict)
    status: AgentStatus = 'collecting_intent'
    error: str = ''
    authorized_scopes: list[str] = field(default_factory=list)
    scenario: str = 'normal'
    trace: list[ToolTraceRecord] = field(default_factory=list)
    provider_info: dict[str, Any] = field(default_factory=dict)
    created_at: float = 0.0
    updated_at: float = 0.0
    handshake_reports: dict[str, Any] = field(default_factory=dict)

    def add_trace(self, record: ToolTraceRecord) -> None:
        self.trace.append(record)

    def tool_names(self) -> list[str]:
        return [item.name for item in self.trace]

    def phase_view(self) -> list[dict[str, Any]]:
        """把工具轨迹聚合成六个对外阶段。"""

        by_phase: dict[str, list[dict[str, Any]]] = {}
        for record in self.trace:
            by_phase.setdefault(record.phase, []).append(record.to_dict())

        view: list[dict[str, Any]] = []
        for phase in AGENT_PHASES:
            steps = by_phase.get(phase['id'], [])
            if steps and all(step['status'] in {'ok', 'fallback'} for step in steps):
                state = 'done'
            elif steps:
                state = 'failed'
            else:
                state = 'pending'
            view.append({**phase, 'state': state, 'steps': steps})
        return view

    def to_dict(self) -> dict[str, Any]:
        return {
            'sessionId': self.session_id,
            'userId': self.user_id,
            'eventId': self.event_id,
            'rawIntent': self.raw_intent,
            'parsedIntent': self.parsed_intent.to_dict() if self.parsed_intent else None,
            'musicProfile': _profile_summary(self.music_profile),
            'candidateIds': self.candidate_ids,
            'excludedCandidates': [item.to_dict() for item in self.excluded_candidates],
            'rankedCandidates': self.ranked_candidates,
            'proposedGroup': self.proposed_group,
            'evidence': self.evidence,
            'pendingConfirmation': self.pending_confirmation,
            'roomId': self.room_id,
            'room': self.room or None,
            'status': self.status,
            'error': self.error,
            'authorizedScopes': self.authorized_scopes,
            'scenario': self.scenario,
            'trace': [item.to_dict() for item in self.trace],
            'phases': self.phase_view(),
            'provider': self.provider_info,
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
            'handshakeReports': self.handshake_reports,
        }


def _profile_summary(profile: UserMusicProfile | None) -> dict[str, Any] | None:
    """序列化成前端 MusicProfile 契约（与 frontend/src/types.ts 严格对齐）。

    前端 AgentEvidence 直接读 favoriteTracks / recentPlays 的长度，
    字段名一旦对不上，「Agent 工作过程」二级页面会整页崩成白屏。
    """
    if profile is None:
        return None
    return {
        'userId': profile.user_id,
        'displayName': profile.display_name,
        'ageBand': profile.age_band,
        'city': profile.city,
        'gender': profile.gender,
        'favoriteTracks': [
            {
                'trackId': track.track_id,
                'title': track.title,
                'artist': track.artist,
                'album': track.album,
                'tags': list(track.tags),
            }
            for track in profile.favorite_tracks
        ],
        'topArtists': list(profile.top_artists),
        'recentPlays': [
            {
                'trackId': play.track_id,
                'title': play.title,
                'artist': play.artist,
                'playCount': play.play_count,
                'lastPlayedAt': play.last_played_at,
            }
            for play in profile.recent_plays
        ],
        'followedEventIds': list(profile.followed_event_ids),
        'playlistTags': list(profile.playlist_tags),
        'authorizedScopes': list(profile.authorized_scopes),
        'source': profile.source,
        'isDemo': profile.is_demo,
    }
