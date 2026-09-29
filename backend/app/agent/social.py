"""社交偏好数据（产品自身收集，不属于 TME 音乐数据）。

音乐画像走 TMEDataProvider，社交偏好走产品自己的存储（Demo 阶段是 SQLite / Demo 记录）。
两者在 CandidateFacts 里合并，Agent 的任何工具都不允许直接读原始 JSON。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.db import get_user
from app.demo_data import DEMO_VIEWER

MEETUP_WILLINGNESS = ('愿意现场见面', '仅在公开场合见面', '先聊熟再见', '暂不线下见面')


@dataclass(frozen=True)
class SocialProfile:
    """用户在本产品里填写的社交偏好。"""

    user_id: str
    display_name: str
    city: str
    gender: str
    purposes: tuple[str, ...] = ()
    expected_tracks: tuple[str, ...] = ()
    chat_style: str = '温和慢热'
    group_size: int = 3
    safety: tuple[str, ...] = ()
    meetup_willingness: str = '愿意现场见面'
    story: str = ''
    blocked_user_ids: tuple[str, ...] = ()
    reported_user_ids: tuple[str, ...] = ()
    is_demo: bool = True


def derive_meetup_willingness(safety: list[str], chat_style: str) -> str:
    """由安全偏好推导见面意愿（确定性规则，不调用大模型）。"""

    if chat_style == '安静听歌' and '不交换私人联系方式' in safety:
        return '暂不线下见面'
    if '先在群里聊熟再见面' in safety:
        return '先聊熟再见'
    if '只在公开场合见面' in safety or '不交换私人联系方式' in safety:
        return '仅在公开场合见面'
    return '愿意现场见面'


def _from_record(record: dict[str, Any], user_id: str) -> SocialProfile:
    safety = list(record.get('safety') or [])
    chat_style = str(record.get('chat_style') or record.get('chatStyle') or '温和慢热')
    return SocialProfile(
        user_id=user_id,
        display_name=str(record.get('nickname') or '同场观众'),
        city=str(record.get('city') or ''),
        gender=str(record.get('gender') or 'undisclosed'),
        purposes=tuple(record.get('purposes') or []),
        expected_tracks=tuple(record.get('expected_tracks') or record.get('expectedTracks') or []),
        chat_style=chat_style,
        group_size=int(record.get('group_size') or record.get('groupSize') or 3),
        safety=tuple(safety),
        meetup_willingness=derive_meetup_willingness(safety, chat_style),
        story=str(record.get('story') or ''),
        blocked_user_ids=tuple(record.get('blocked_user_ids') or []),
        reported_user_ids=tuple(record.get('reported_user_ids') or []),
        is_demo=True,
    )


def load_social_profile(user_id: str) -> SocialProfile | None:
    """读取社交偏好：演示访客走内置 Demo 记录，其余读者走产品自己的存储。"""

    if user_id in {'', 'me', 'demo-viewer', DEMO_VIEWER['id']}:
        return _from_record(DEMO_VIEWER, DEMO_VIEWER['id'])
    record = get_user(user_id)
    if record is None:
        return None
    return _from_record(record, user_id)


def viewer_social_profile() -> SocialProfile:
    return _from_record(DEMO_VIEWER, DEMO_VIEWER['id'])


def is_blocked_or_reported(viewer: SocialProfile, candidate_id: str) -> bool:
    return candidate_id in viewer.blocked_user_ids or candidate_id in viewer.reported_user_ids