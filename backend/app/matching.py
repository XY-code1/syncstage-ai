"""兼容层：把旧的表单式偏好转成新评分引擎的输入。

真正的评分逻辑只有一份：app/agent/scoring.py（与前端 frontend/src/lib/scoring.ts 同权重）。
本文件只负责"表单 -> CandidateFacts / ParsedIntent"的适配，保证老接口也能返回
scoreBreakdown 与 evidence，而不是只给一个总分。
"""

from __future__ import annotations

import re
from typing import Any

from app.agent.scoring import CandidateFacts, rank_candidates
from app.agent.social import derive_meetup_willingness
from app.agent.state import ParsedIntent
from app.agent.tools.reasoning import reason_for


# 听歌故事关键词（保留给标签抽取使用）
STORY_KEYWORDS = [
    '深夜', '加班', '失恋', '毕业', '考研', '通勤', '海边', '夏天', '一个人', '朋友', '现场',
    '第一次', '大学', '高中', '下雨', '地铁', '夜班', '旅行', '画画', '写歌', '副歌', '耳机',
]


def extract_story_keywords(text: str) -> list[str]:
    return [keyword for keyword in STORY_KEYWORDS if keyword in (text or '')]


def _as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value:
        return [str(value)]
    return []


def facts_from_prefs(prefs: dict[str, Any], user_id: str = 'u-viewer') -> CandidateFacts:
    """把表单偏好当成一位"你自己"的事实集合。"""

    safety = _as_list(prefs.get('safety'))
    chat_style = str(prefs.get('chatStyle') or '温和慢热')
    return CandidateFacts(
        user_id=user_id,
        nickname=str(prefs.get('nickname') or '你'),
        gender=str(prefs.get('myGender') or 'prefer-not-to-say'),
        age_band=str(prefs.get('ageBand') or ''),
        city=str(prefs.get('city') or ''),
        favorite_titles=tuple(_as_list(prefs.get('likedSongs'))),
        top_artists=tuple(_as_list(prefs.get('likedArtists'))),
        recent_titles=tuple(_as_list(prefs.get('recentPlays'))),
        playlist_tags=tuple(_as_list(prefs.get('playlistTags'))),
        purposes=tuple(_as_list(prefs.get('purposes'))),
        expected_tracks=tuple(_as_list(prefs.get('expectedTracks'))),
        chat_style=chat_style,
        group_size=int(prefs.get('groupSize') or 3),
        safety=tuple(safety),
        meetup_willingness=derive_meetup_willingness(safety, chat_style),
        story=str(prefs.get('story') or ''),
    )


def intent_from_prefs(prefs: dict[str, Any]) -> ParsedIntent:
    safety = _as_list(prefs.get('safety'))
    return ParsedIntent(
        event_id=str(prefs.get('eventId') or ''),
        mentioned_songs=_as_list(prefs.get('expectedTracks')),
        mentioned_artists=_as_list(prefs.get('likedArtists')),
        purposes=_as_list(prefs.get('purposes')),
        chat_style=str(prefs.get('chatStyle') or '温和慢热'),
        group_size=int(prefs.get('groupSize') or 3),
        same_gender_only='希望同行者性别相同' in safety,
        me_gender=str(prefs.get('myGender') or 'prefer-not-to-say'),
        meet_in_person=True,
        age_band=str(prefs.get('ageBand') or ''),
        strict=bool(prefs.get('strict')),
        safety=safety,
    )


AGE_BANDS = ('18-22', '23-26', '27-30', '31+')


def age_band_from_label(profile_label: str) -> str:
    """从"22 岁 · 大四在读"这类展示字段里推出年龄段。"""

    matched = re.search(r'(\d+)\s*岁', profile_label or '')
    if not matched:
        return ''
    age = int(matched.group(1))
    if age <= 22:
        return '18-22'
    if age <= 26:
        return '23-26'
    if age <= 30:
        return '27-30'
    return '31+'


def facts_from_candidate(candidate: dict[str, Any]) -> CandidateFacts:
    """把候选人记录（camelCase）转成事实集合。"""

    safety = _as_list(candidate.get('safety'))
    chat_style = str(candidate.get('chatStyle') or '温和慢热')
    return CandidateFacts(
        user_id=str(candidate.get('id') or candidate.get('userId') or ''),
        nickname=str(candidate.get('nickname') or '同场观众'),
        gender=str(candidate.get('gender') or 'undisclosed'),
        age_band=str(candidate.get('ageBand') or age_band_from_label(str(candidate.get('profileLabel') or ''))),
        city=str(candidate.get('city') or ''),
        favorite_titles=tuple(_as_list(candidate.get('likedSongs'))),
        top_artists=tuple(_as_list(candidate.get('likedArtists'))),
        recent_titles=tuple(_as_list(candidate.get('recentPlays'))),
        playlist_tags=tuple(_as_list(candidate.get('playlistTags'))),
        followed_event_ids=tuple(_as_list(candidate.get('concertIds'))),
        purposes=tuple(_as_list(candidate.get('purposes'))),
        expected_tracks=tuple(_as_list(candidate.get('expectedTracks'))),
        chat_style=chat_style,
        group_size=int(candidate.get('groupSize') or 3),
        safety=tuple(safety),
        meetup_willingness=str(candidate.get('meetupWillingness') or derive_meetup_willingness(safety, chat_style)),
        story=str(candidate.get('story') or ''),
        headline=str(candidate.get('headline') or ''),
        profile_label=str(candidate.get('profileLabel') or ''),
        avatar=dict(candidate.get('avatar') or {'from': '#31c27c', 'to': '#0b1116'}),
        show_count=int(candidate.get('showCount') or 0),
        active_hint=str(candidate.get('activeHint') or ''),
    )


def compute_matches(prefs: dict[str, Any], pool: list[dict[str, Any]], relax: bool = False) -> dict[str, Any]:
    """老接口的实现：返回全部候选人（按分数排序）+ scoreBreakdown + evidence。"""

    viewer = facts_from_prefs(prefs)
    intent = intent_from_prefs(prefs)

    kept: list[CandidateFacts] = []
    blocked = 0
    for raw in pool:
        candidate = facts_from_candidate(raw)
        if candidate.age_band == '':
            candidate.age_band = viewer.age_band
        if not relax:
            from app.agent.scoring import check_hard_constraints
            from app.agent.social import SocialProfile

            viewer_social = SocialProfile(
                user_id=viewer.user_id,
                display_name=viewer.nickname,
                city=viewer.city,
                gender=viewer.gender,
                safety=viewer.safety,
                chat_style=viewer.chat_style,
            )
            if check_hard_constraints(viewer, viewer_social, intent, candidate, intent.event_id) is not None:
                blocked += 1
                continue
        kept.append(candidate)

    results = rank_candidates(viewer, intent, kept)
    for item in results:
        item['matchReason'] = reason_for(item)

    return {'results': results, 'blockedCount': blocked, 'poolSize': len(pool)}