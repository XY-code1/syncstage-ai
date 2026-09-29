"""同频评分引擎（后端与前端 frontend/src/lib/scoring.ts 保持同一套权重）。

权重：音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全偏好 15%。
硬条件（不参与打分，直接排除）：同场演出、年龄段兼容、性别偏好兼容、
组队人数兼容、见面意愿兼容、未被拉黑或举报。
API 必须同时返回 scoreBreakdown 与 evidence，不允许只给一个总分。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.agent.social import SocialProfile, is_blocked_or_reported
from app.agent.state import ExcludedCandidate, ParsedIntent
from app.integrations.base import UserMusicProfile

AGE_BANDS = ('18-22', '23-26', '27-30', '31+')

DIMENSION_WEIGHTS: dict[str, int] = {
    'music': 40,
    'expected': 25,
    'social': 20,
    'style_safety': 15,
}

DIMENSION_LABELS: dict[str, str] = {
    'music': '音乐偏好',
    'expected': '演出期待',
    'social': '社交目的',
    'style_safety': '交流与安全偏好',
}

STYLE_ORDER = ('热情外放', '温和慢热', '安静听歌')

EXCLUSION_LABELS: dict[str, str] = {
    'different_event': '不是同一场演出',
    'age_band': '年龄段不兼容',
    'gender': '性别偏好不兼容',
    'group_size': '组队人数不兼容',
    'meetup': '见面意愿不兼容',
    'blocked': '已被你拉黑或举报',
}


@dataclass
class CandidateFacts:
    """一位同场候选人的完整事实（音乐侧来自 TME Provider，社交侧来自产品自身）。"""

    user_id: str
    nickname: str
    gender: str
    age_band: str
    city: str
    favorite_titles: tuple[str, ...] = ()
    top_artists: tuple[str, ...] = ()
    recent_titles: tuple[str, ...] = ()
    playlist_tags: tuple[str, ...] = ()
    followed_event_ids: tuple[str, ...] = ()
    purposes: tuple[str, ...] = ()
    expected_tracks: tuple[str, ...] = ()
    chat_style: str = '温和慢热'
    group_size: int = 3
    safety: tuple[str, ...] = ()
    meetup_willingness: str = '愿意现场见面'
    story: str = ''
    headline: str = ''
    profile_label: str = ''
    avatar: dict[str, str] = field(default_factory=lambda: {'from': '#31c27c', 'to': '#0b1116'})
    show_count: int = 0
    active_hint: str = ''
    is_demo: bool = True

    def to_public(self) -> dict[str, Any]:
        return {
            'userId': self.user_id,
            'nickname': self.nickname,
            'gender': self.gender,
            'ageBand': self.age_band,
            'city': self.city,
            'avatar': self.avatar,
            'headline': self.headline,
            'profileLabel': self.profile_label,
            'showCount': self.show_count,
            'activeHint': self.active_hint,
            'chatStyle': self.chat_style,
            'groupSize': self.group_size,
            'purposes': list(self.purposes),
            'topArtists': list(self.top_artists),
            'playlistTags': list(self.playlist_tags),
            'meetupWillingness': self.meetup_willingness,
            'isDemo': self.is_demo,
        }


def build_facts(music: UserMusicProfile, social: SocialProfile, extra: dict[str, Any] | None = None) -> CandidateFacts:
    """把 TME 音乐画像与产品侧社交偏好合并成一份事实集合。"""

    payload = extra or {}
    return CandidateFacts(
        user_id=music.user_id,
        nickname=social.display_name,
        gender=music.gender,
        age_band=music.age_band,
        city=music.city or social.city,
        favorite_titles=music.favorite_titles(),
        top_artists=music.top_artists,
        recent_titles=music.recent_titles(),
        playlist_tags=music.playlist_tags,
        followed_event_ids=music.followed_event_ids,
        purposes=social.purposes,
        expected_tracks=social.expected_tracks,
        chat_style=social.chat_style,
        group_size=social.group_size,
        safety=social.safety,
        meetup_willingness=social.meetup_willingness,
        story=social.story,
        headline=str(payload.get('headline') or ''),
        profile_label=str(payload.get('profile_label') or ''),
        avatar=dict(payload.get('avatar') or {'from': '#31c27c', 'to': '#0b1116'}),
        show_count=int(payload.get('show_count') or 0),
        active_hint=str(payload.get('active_hint') or ''),
    )


def _intersect(first: tuple[str, ...] | list[str], second: tuple[str, ...] | list[str]) -> list[str]:
    pool = set(second)
    seen: set[str] = set()
    result: list[str] = []
    for item in first:
        if item in pool and item not in seen:
            seen.add(item)
            result.append(item)
    return result


def age_band_distance(first: str, second: str) -> int:
    if first not in AGE_BANDS or second not in AGE_BANDS:
        return 0
    return abs(AGE_BANDS.index(first) - AGE_BANDS.index(second))


def _style_distance(first: str, second: str) -> int:
    if first not in STYLE_ORDER or second not in STYLE_ORDER:
        return 2
    return abs(STYLE_ORDER.index(first) - STYLE_ORDER.index(second))


def check_hard_constraints(
    viewer: CandidateFacts,
    viewer_social: SocialProfile,
    intent: ParsedIntent,
    candidate: CandidateFacts,
    event_id: str,
) -> ExcludedCandidate | None:
    """硬条件检查。返回 None 表示通过，否则返回被排除的原因。"""

    def excluded(rule: str, reason: str) -> ExcludedCandidate:
        return ExcludedCandidate(
            user_id=candidate.user_id,
            nickname=candidate.nickname,
            rule=EXCLUSION_LABELS.get(rule, rule),
            reason=reason,
        )

    if event_id and candidate.followed_event_ids and event_id not in candidate.followed_event_ids:
        return excluded('different_event', 'ta 关注的演出里没有这一场')

    age_limit = 0 if intent.strict else 1
    if intent.age_band and age_band_distance(intent.age_band, candidate.age_band) > age_limit:
        return excluded(
            'age_band',
            'ta 在 ' + candidate.age_band + ' 年龄段，与你要的 ' + intent.age_band
            + ('（严格模式：必须同段）' if intent.strict else '（允许相邻段）') + ' 不符',
        )

    if intent.same_gender_only and intent.me_gender in {'female', 'male'}:
        if candidate.gender in {'female', 'male'} and candidate.gender != intent.me_gender:
            return excluded('gender', '你希望同行者性别相同，ta 的性别不一致')

    size_limit = 0 if intent.strict else 1
    if abs(candidate.group_size - intent.group_size) > size_limit:
        return excluded(
            'group_size',
            'ta 想组 ' + str(candidate.group_size) + ' 人，与你要的 ' + str(intent.group_size) + ' 人'
            + ('严格模式要求完全一致' if intent.strict else '差距过大'),
        )

    if intent.meet_in_person and candidate.meetup_willingness == '暂不线下见面':
        return excluded('meetup', 'ta 目前只想在房间聊天，暂时不线下见面')

    if is_blocked_or_reported(viewer_social, candidate.user_id):
        return excluded('blocked', 'ta 在你拉黑或举报的名单里')

    return None


def _music_dimension(viewer: CandidateFacts, candidate: CandidateFacts, shared: dict[str, list[str]]) -> dict[str, Any]:
    songs = shared['songs']
    artists = shared['artists']
    recent = shared['recent']
    tags = shared['tags']

    # 只有两边都拿得到的数据才参与这一维；否则按可用信号重新归一化，
    # 避免"用户没授权近期播放"这类情况把分数无端压低。
    signals: list[tuple[float, float]] = [(0.50, min(len(songs) / 3, 1.0))]
    if viewer.top_artists and candidate.top_artists:
        signals.append((0.25, min(len(artists) / 2, 1.0)))
    if viewer.recent_titles and candidate.recent_titles:
        signals.append((0.15, min(len(recent) / 2, 1.0)))
    if viewer.playlist_tags and candidate.playlist_tags:
        signals.append((0.10, min(len(tags) / 2, 1.0)))

    active = sum(weight for weight, _ in signals) or 1.0
    sub = sum(weight * value for weight, value in signals) / active

    detail = '共同收藏 ' + str(len(songs)) + ' 首 · 共同歌手 ' + str(len(artists)) + ' 位'
    if recent:
        detail += ' · 近期都在听《' + recent[0] + '》'
    return {'id': 'music', 'label': DIMENSION_LABELS['music'], 'weight': DIMENSION_WEIGHTS['music'],
            'ratio': round(sub, 4), 'detail': detail}


def _expected_dimension(viewer: CandidateFacts, candidate: CandidateFacts, shared: dict[str, list[str]]) -> dict[str, Any]:
    both_expected = shared['expected']
    cand_wants_mine = shared['expected_from_my_favorite']
    i_want_theirs = shared['my_expected_in_their_favorite']

    signals: list[tuple[float, float]] = []
    if viewer.expected_tracks or candidate.expected_tracks:
        signals.append((0.60, min(len(both_expected) / 2, 1.0)))
    if viewer.favorite_titles:
        signals.append((0.25, min(len(cand_wants_mine) / 2, 1.0)))
    if viewer.expected_tracks:
        signals.append((0.15, min(len(i_want_theirs) / 2, 1.0)))

    active = sum(weight for weight, _ in signals) or 1.0
    sub = sum(weight * value for weight, value in signals) / active

    parts: list[str] = []
    if both_expected:
        parts.append('都在等《' + '》《'.join(both_expected[:2]) + '》')
    if cand_wants_mine:
        parts.append('ta 想听的正好是你的收藏')
    if i_want_theirs:
        parts.append('你想听的也在 ta 的收藏里')
    detail = ' · '.join(parts) if parts else '现场期待没有明显交集'
    return {'id': 'expected', 'label': DIMENSION_LABELS['expected'], 'weight': DIMENSION_WEIGHTS['expected'],
            'ratio': round(sub, 4), 'detail': detail}


def _social_dimension(intent: ParsedIntent, candidate: CandidateFacts, shared: dict[str, list[str]]) -> dict[str, Any]:
    purposes = shared['purposes']
    wanted = intent.purposes or list(candidate.purposes)
    signals: list[tuple[float, float]] = []
    if wanted:
        signals.append((0.60, min(len(purposes) / 2, 1.0)))

    size_gap = abs(candidate.group_size - intent.group_size)
    signals.append((0.20, 1.0 if size_gap == 0 else 0.5 if size_gap == 1 else 0.0))

    meetup_match = 0.0
    if candidate.meetup_willingness == '愿意现场见面':
        meetup_match = 1.0
    elif candidate.meetup_willingness == '仅在公开场合见面':
        meetup_match = 0.8
    elif candidate.meetup_willingness == '先聊熟再见':
        meetup_match = 0.6
    signals.append((0.20, meetup_match))

    active = sum(weight for weight, _ in signals) or 1.0
    sub = sum(weight * value for weight, value in signals) / active

    parts: list[str] = []
    if purposes:
        parts.append('共同目的「' + '」「'.join(purposes[:2]) + '」')
    parts.append('组队 ' + str(candidate.group_size) + ' 人')
    parts.append(candidate.meetup_willingness)
    return {'id': 'social', 'label': DIMENSION_LABELS['social'], 'weight': DIMENSION_WEIGHTS['social'],
            'ratio': round(sub, 4), 'detail': ' · '.join(parts)}


def _style_safety_dimension(viewer: CandidateFacts, candidate: CandidateFacts, shared: dict[str, list[str]]) -> dict[str, Any]:
    gap = _style_distance(viewer.chat_style, candidate.chat_style)
    style_ratio = 1.0 if gap == 0 else 0.5 if gap == 1 else 0.0
    signals: list[tuple[float, float]] = [(0.55, style_ratio)]
    if viewer.safety or candidate.safety:
        signals.append((0.45, min(len(shared['safety']) / 3, 1.0)))

    active = sum(weight for weight, _ in signals) or 1.0
    sub = sum(weight * value for weight, value in signals) / active

    parts = [
        '交流节奏一致' if gap == 0 else '交流节奏接近' if gap == 1 else '交流节奏差异较大'
    ]
    if shared['safety']:
        parts.append('安全边界一致 ' + str(len(shared['safety'])) + ' 条')
    return {'id': 'style_safety', 'label': DIMENSION_LABELS['style_safety'], 'weight': DIMENSION_WEIGHTS['style_safety'],
            'ratio': round(sub, 4), 'detail': ' · '.join(parts)}


def band_of(score: int) -> str:
    if score >= 80:
        return 'high'
    if score >= 62:
        return 'mid'
    return 'low'


def _shared_facts(
    viewer: CandidateFacts,
    candidate: CandidateFacts,
    intent: ParsedIntent,
) -> dict[str, list[str]]:
    return {
        'songs': _intersect(viewer.favorite_titles, candidate.favorite_titles),
        'artists': _intersect(viewer.top_artists, candidate.top_artists),
        'recent': _intersect(viewer.recent_titles, candidate.recent_titles),
        'tags': _intersect(viewer.playlist_tags, candidate.playlist_tags),
        'expected': _intersect(viewer.expected_tracks, candidate.expected_tracks),
        'expected_from_my_favorite': _intersect(candidate.expected_tracks, viewer.favorite_titles),
        'my_expected_in_their_favorite': _intersect(viewer.expected_tracks, candidate.favorite_titles),
        'purposes': _intersect(intent.purposes or list(viewer.purposes), candidate.purposes),
        'safety': _intersect(viewer.safety, candidate.safety),
        'intent_songs': _intersect(intent.mentioned_songs, list(candidate.favorite_titles) + list(candidate.expected_tracks)),
        'intent_artists': _intersect(intent.mentioned_artists, candidate.top_artists),
    }


def build_evidence(shared: dict[str, list[str]], viewer: CandidateFacts, candidate: CandidateFacts, intent: ParsedIntent) -> list[dict[str, Any]]:
    """只根据真实存在的共同点生成证据，没有就不写。"""

    evidence: list[dict[str, Any]] = []

    def add(kind: str, label: str, text: str, source: str, source_label: str, items: list[str]) -> None:
        evidence.append(
            {
                'kind': kind,
                'label': label,
                'text': text,
                'source': source,
                'sourceLabel': source_label,
                'items': items,
            }
        )

    if shared['songs']:
        add('song', '共同收藏歌曲', '你们的收藏里都有《' + '》《'.join(shared['songs'][:3]) + '》',
            'favorite_songs', '收藏歌曲', shared['songs'][:3])
    if shared['expected']:
        add('expected', '共同现场期待', '你们两个都想在现场听到《' + '》《'.join(shared['expected'][:2]) + '》',
            'expected_tracks', '期待曲目', shared['expected'][:2])
    if shared['artists']:
        add('artist', '共同常听歌手', '常听歌手都有 ' + '、'.join(shared['artists'][:3]),
            'top_artists', '常听歌手', shared['artists'][:3])
    if shared['recent']:
        add('recent', '近期播放重合', '最近都在循环《' + '》《'.join(shared['recent'][:2]) + '》',
            'recent_plays', '近期播放', shared['recent'][:2])
    if shared['tags']:
        add('tag', '歌单标签重合', '你们的歌单都打了「' + '」「'.join(shared['tags'][:2]) + '」这样的标签',
            'playlist_tags', '歌单标签', shared['tags'][:2])
    if shared['purposes']:
        add('purpose', '共同同行目的', '都想「' + '」「'.join(shared['purposes'][:2]) + '」',
            'intent', '你这次的原话', shared['purposes'][:2])
    if shared['intent_songs']:
        add('intent_song', '你点名的歌 ta 也有', '你提到想听《' + '》《'.join(shared['intent_songs'][:2]) + '》，ta 的歌单里正好有',
            'intent', '你这次的原话', shared['intent_songs'][:2])
    if shared['safety']:
        add('safety', '安全边界一致', '都选择了「' + '」「'.join(shared['safety'][:2]) + '」',
            'intent', '你这次的原话', shared['safety'][:2])
    if shared['artists'] or shared['songs']:
        add('event', '同一场演出', '你们都关注了这场演出，属于同场观众',
            'followed_events', '关注演出', [])
    return evidence


def build_differences(shared: dict[str, list[str]], viewer: CandidateFacts, candidate: CandidateFacts, intent: ParsedIntent) -> list[str]:
    differences: list[str] = []
    if viewer.chat_style != candidate.chat_style:
        differences.append('对方的交流节奏是「' + candidate.chat_style + '」，你是「' + viewer.chat_style + '」')
    if candidate.group_size != intent.group_size:
        differences.append('对方想组 ' + str(candidate.group_size) + ' 人，你这次要的是 ' + str(intent.group_size) + ' 人')
    if viewer.age_band != candidate.age_band:
        differences.append('ta 在 ' + candidate.age_band + ' 年龄段，你在 ' + viewer.age_band)
    if candidate.meetup_willingness != '愿意现场见面':
        differences.append('对方的见面意愿是「' + candidate.meetup_willingness + '」')
    missing = [item for item in (intent.purposes or list(viewer.purposes)) if item not in shared['purposes']]
    if missing:
        differences.append('你想「' + missing[0] + '」，对方的目的里没有这一条')
    if not shared['songs']:
        differences.append('你们的收藏里没有重合的歌，交集更多在同行方式上')
    if not differences:
        differences.append('目前看不出明显差异，建议先聊一首歌确认彼此的节奏')
    return differences[:3]


def score_candidate(viewer: CandidateFacts, intent: ParsedIntent, candidate: CandidateFacts) -> dict[str, Any]:
    """给一位候选人打分，返回 score + scoreBreakdown + evidence + differences。"""

    shared = _shared_facts(viewer, candidate, intent)
    dimensions = [
        _music_dimension(viewer, candidate, shared),
        _expected_dimension(viewer, candidate, shared),
        _social_dimension(intent, candidate, shared),
        _style_safety_dimension(viewer, candidate, shared),
    ]

    total_ratio = 0.0
    for dimension in dimensions:
        dimension['points'] = round(dimension['weight'] * dimension['ratio'], 1)
        total_ratio += dimension['weight'] * dimension['ratio']

    score = max(0, min(99, round(total_ratio)))
    evidence = build_evidence(shared, viewer, candidate, intent)

    return {
        'userId': candidate.user_id,
        'candidate': candidate.to_public(),
        'score': score,
        'band': band_of(score),
        'scoreBreakdown': {
            'total': score,
            'band': band_of(score),
            'dimensions': dimensions,
            'formula': '音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全偏好 15%',
        },
        'sharedSongs': shared['songs'],
        'sharedArtists': shared['artists'],
        'sharedRecent': shared['recent'],
        'sharedTags': shared['tags'],
        'sharedPurposes': shared['purposes'],
        'sharedExpectedTracks': shared['expected'],
        'sharedSafety': shared['safety'],
        'differences': build_differences(shared, viewer, candidate, intent),
        'evidence': evidence,
        'matchReason': '',
        'blockedBySafety': False,
    }


def rank_candidates(viewer: CandidateFacts, intent: ParsedIntent, candidates: list[CandidateFacts]) -> list[dict[str, Any]]:
    results = [score_candidate(viewer, intent, candidate) for candidate in candidates]
    results.sort(
        key=lambda item: (item['score'], len(item['sharedSongs']), len(item['sharedPurposes'])),
        reverse=True,
    )
    return results