"""MockQQMusicProvider：用脱敏 Demo 数据模拟 QQ 音乐的数据能力。

初赛没有 TME 官方 API，本 Provider 提供与官方接口同形的数据结构：
收藏歌曲 / 常听歌手 / 近期播放 / 关注演出 / 歌单标签。
所有记录均来自 backend/app/demo_data.py 中的虚构数据，不涉及真实用户。
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable

from app.demo_data import DEMO_CONCERTS, DEMO_NOTICE, DEMO_USERS, DEMO_VIEWER
from app.integrations.base import (
    MOCK_DISCLAIMER,
    EventContext,
    RecentPlay,
    TMEDataProvider,
    TrackMetadata,
    UserMusicProfile,
)

ALL_SCOPES = ('favorite_songs', 'top_artists', 'recent_plays', 'followed_events', 'playlist_tags')

# 歌手 -> 风格标签，用来生成歌单标签（虚构归类，仅用于演示）
ARTIST_GENRES: dict[str, str] = {
    '星野回声': '后摇',
    '沈亦舟': '城市民谣',
    '潮汐线': '独立摇滚',
    '海边有风': '海边民谣',
    '短波电台': '合成器流行',
    '南方的南方': '南方民谣',
    '慢速快门': '氛围电子',
    '无人的房间': '暗潮',
    '城市之光合唱团': '合唱',
    '惘闻': '后摇',
}

# 每人的歌单标签（手写，读起来更像真实歌单名）
PLAYLIST_TAGS: dict[str, tuple[str, ...]] = {
    'u-01': ('深夜通勤', '副歌高音区', '毕业季循环'),
    'u-02': ('图书馆闭馆歌单', '考研自习室', '雨天单曲循环'),
    'u-03': ('一个人的高铁', '安静听歌', '睡前白噪音'),
    'u-04': ('现场速写', '快门与鼓点', '巡演打卡'),
    'u-05': ('加班回家路上', '末班地铁', '同事一起听'),
    'u-06': ('高中回忆杀', '大合唱歌单', '荧光色系'),
    'u-07': ('夜班后台', '调音台旁', '低音贝斯'),
    'u-08': ('城市散步', '路边摊夜宵', '老歌翻唱'),
    'u-09': ('深夜写作', '雨声采样', '孤独但不emo'),
    'u-10': ('周末看展', '慢速生活', '咖啡店背景音'),
    'u-11': ('跨城看演出', '高铁歌单', '第一次一个人'),
    'u-12': ('乐队排练室', '翻唱练习', '鼓点很重'),
    'u-13': ('海边旅行', '毕业旅行', '咸味的风'),
    'u-14': ('回南天', '潮湿天气', '窗边听歌'),
    'u-15': ('社恐友好', '耳机半只', '安静角落'),
    'u-16': ('现场速写本', '插画BGM', '合唱瞬间'),
    'u-viewer': ('考研那一年', '深夜通勤', '副歌一定要唱'),
}


# 演出曲目之外的补充曲目（用于跨场次推荐）
EXTRA_TRACKS: dict[str, tuple[str, str]] = {
    '别在夏天说再见': ('星野回声', '夜航计划'),
    '夏天最后一支歌': ('潮汐线', '潮汐线'),
    '凌晨四点的便利店': ('沈亦舟', '潮湿的午夜'),
    '回南天': ('潮汐线', '潮汐线'),
}

DEFAULT_ARTIST = '星野回声'


def _track_id(title: str) -> str:
    digest = hashlib.sha1(title.strip().encode('utf-8')).hexdigest()[:10]
    return 'trk-' + digest


def _age_band(profile_label: str, explicit: int | None = None) -> str:
    age = explicit
    if age is None:
        matched = re.search(r'(\d+)\s*岁', profile_label or '')
        age = int(matched.group(1)) if matched else 24
    if age <= 22:
        return '18-22'
    if age <= 26:
        return '23-26'
    if age <= 30:
        return '27-30'
    return '31+'


def _build_catalog() -> dict[str, TrackMetadata]:
    catalog: dict[str, TrackMetadata] = {}
    for concert in DEMO_CONCERTS:
        for index, song in enumerate(concert.get('setlist') or []):
            catalog[song] = TrackMetadata(
                track_id=_track_id(song),
                title=song,
                artist=concert['artist'],
                album=concert['title'],
                duration_sec=185 + (index * 17) % 120,
                tags=tuple(concert.get('poster', {}).get('keywords') or []),
                source='mock_demo',
            )
    for title, (artist, album) in EXTRA_TRACKS.items():
        catalog.setdefault(
            title,
            TrackMetadata(
                track_id=_track_id(title),
                title=title,
                artist=artist,
                album=album,
                duration_sec=210,
                tags=('单曲',),
                source='mock_demo',
            ),
        )
    return catalog


CATALOG: dict[str, TrackMetadata] = _build_catalog()
TITLE_INDEX: dict[str, str] = {track.title: track.track_id for track in CATALOG.values()}
INDEX_BY_ID: dict[str, TrackMetadata] = {track.track_id: track for track in CATALOG.values()}


def _playlist_tags(user_id: str, liked_artists: list[str]) -> tuple[str, ...]:
    tags = list(PLAYLIST_TAGS.get(user_id, ()))
    for artist in liked_artists:
        genre = ARTIST_GENRES.get(artist)
        if genre and genre not in tags:
            tags.append(genre)
    return tuple(tags[:4])


def _recent_plays(user_id: str, expected: list[str], liked: list[str], seed: int) -> tuple[RecentPlay, ...]:
    pool = list(dict.fromkeys([*expected, *liked]))[:4]
    plays: list[RecentPlay] = []
    for index, title in enumerate(pool):
        track = CATALOG.get(title)
        artist = track.artist if track else DEFAULT_ARTIST
        plays.append(
            RecentPlay(
                track_id=_track_id(title),
                title=title,
                artist=artist,
                play_count=48 - index * 9 - (seed % 5),
                last_played_at='2026-09-' + str(18 + (seed + index) % 10).zfill(2),
                source='mock_demo',
            )
        )
    plays.sort(key=lambda item: item.play_count, reverse=True)
    return tuple(plays)


def _tracks_for(titles: Iterable[str], liked_artists: list[str]) -> tuple[TrackMetadata, ...]:
    fallback_artist = liked_artists[0] if liked_artists else DEFAULT_ARTIST
    tracks: list[TrackMetadata] = []
    for title in titles:
        track = CATALOG.get(title)
        if track:
            tracks.append(track)
            continue
        tracks.append(
            TrackMetadata(
                track_id=_track_id(title),
                title=title,
                artist=fallback_artist,
                album='',
                duration_sec=200,
                tags=(),
                source='mock_demo',
            )
        )
    return tuple(tracks)


def _profile_from_record(record: dict, user_id: str, scopes: Iterable[str] | None) -> UserMusicProfile:
    granted = set(scopes) if scopes is not None else set(ALL_SCOPES)
    liked_songs = list(record.get('liked_songs') or [])
    liked_artists = list(record.get('liked_artists') or [])
    expected = list(record.get('expected_tracks') or [])

    return UserMusicProfile(
        user_id=user_id,
        display_name=str(record.get('nickname') or '同场观众'),
        age_band=_age_band(str(record.get('profile_label') or ''), record.get('age')),
        city=str(record.get('city') or ''),
        gender=str(record.get('gender') or 'undisclosed'),
        favorite_tracks=_tracks_for(liked_songs, liked_artists) if 'favorite_songs' in granted else (),
        top_artists=tuple(liked_artists) if 'top_artists' in granted else (),
        recent_plays=_recent_plays(user_id, expected, liked_songs, len(user_id)) if 'recent_plays' in granted else (),
        followed_event_ids=tuple(record.get('concert_ids') or []) if 'followed_events' in granted else (),
        playlist_tags=_playlist_tags(user_id, liked_artists) if 'playlist_tags' in granted else (),
        authorized_scopes=tuple(sorted(granted)),
        blocked_user_ids=tuple(record.get('blocked_user_ids') or []),
        reported_user_ids=tuple(record.get('reported_user_ids') or []),
        source='mock_demo',
        is_demo=True,
    )


class MockQQMusicProvider(TMEDataProvider):
    """脱敏 Demo 数据实现，用于初赛演示。"""

    name = 'mock_qqmusic'
    source = 'mock_demo'
    disclaimer = MOCK_DISCLAIMER

    def get_user_music_profile(self, user_id: str, scopes: Iterable[str] | None = None) -> UserMusicProfile | None:
        if user_id == DEMO_VIEWER['id'] or user_id in {'', 'me', 'demo-viewer'}:
            return _profile_from_record(DEMO_VIEWER, DEMO_VIEWER['id'], scopes)
        record = next((item for item in DEMO_USERS if item['id'] == user_id), None)
        if record is None:
            return None
        return _profile_from_record(record, user_id, scopes)

    def get_event_context(self, event_id: str) -> EventContext | None:
        concert = next((item for item in DEMO_CONCERTS if item['id'] == event_id), None)
        if concert is None:
            return None
        attendees = tuple(
            item['id'] for item in DEMO_USERS if event_id in (item.get('concert_ids') or [])
        )
        return EventContext(
            event_id=concert['id'],
            title=concert['title'],
            artist=concert['artist'],
            city=concert['city'],
            venue=concert['venue'],
            starts_at=concert['date'],
            doors_open=concert.get('capacity_note', ''),
            age_policy='本场建议 16 岁以上，未成年人需监护人陪同',
            hot_tracks=tuple(concert.get('hot_songs') or []),
            setlist=tuple(concert.get('setlist') or []),
            attendee_user_ids=attendees,
            meeting_point=dict(concert.get('meeting_point') or {}),
            safety_tips=tuple(concert.get('safety_tips') or []),
            source='mock_demo',
            is_demo=True,
        )

    def get_track_metadata(self, track_ids: list[str]) -> list[TrackMetadata]:
        found: list[TrackMetadata] = []
        for track_id in track_ids:
            track = INDEX_BY_ID.get(track_id)
            if track is None and track_id in TITLE_INDEX:
                track = INDEX_BY_ID[TITLE_INDEX[track_id]]
            if track is not None:
                found.append(track)
        return found

    def search_tracks(self, query: str) -> list[TrackMetadata]:
        text = (query or '').strip()
        if not text:
            return []
        hits = [
            track
            for track in CATALOG.values()
            if text in track.title or track.title in text or text == track.artist
        ]
        if not hits and text in TITLE_INDEX:
            hits = [INDEX_BY_ID[TITLE_INDEX[text]]]
        return hits[:8]

    def describe(self) -> dict[str, object]:
        payload = super().describe()
        payload.update(
            {
                'scopes': list(ALL_SCOPES),
                'trackCount': len(CATALOG),
                'userCount': len(DEMO_USERS),
                'notice': DEMO_NOTICE,
            }
        )
        return payload