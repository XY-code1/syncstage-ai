"""TMEDataProvider：音乐演出数据的统一抽象接口。

设计约束（重要）：
1. Agent / 业务层只能通过本接口拿到音乐画像、演出上下文与曲目元数据；
2. 不允许任何模块直接读 JSON 文件、SQLite 表或写死字典来拿这些数据；
3. 初赛阶段由 MockQQMusicProvider 提供脱敏 Demo 数据；
   入围后只需实现 OfficialTMEProvider，业务代码无需改动。

约定：
- provider 返回 None 表示"查不到该实体"，返回空元组表示"查到了但没有数据"；
- provider 抛 TMEDataUnavailable 表示数据源不可用，调用方必须显式处理
  （Agent 会转换成 no_match / error 状态，绝不能编造候选人）。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal

ProviderSource = Literal['mock_demo', 'official_tme']

MOCK_DISCLAIMER = (
    '初赛暂未提供 TME 官方 API，当前使用脱敏 Demo 数据模拟；入围后可替换官方测试 API。'
)


class TMEDataUnavailable(RuntimeError):
    """数据源不可用（网络、鉴权、限流、未实现）。"""

    def __init__(self, message: str, *, reason: str = 'unavailable') -> None:
        super().__init__(message)
        self.reason = reason


@dataclass(frozen=True)
class TrackMetadata:
    """曲目元数据。track_id 在 mock 与官方实现里语义一致。"""

    track_id: str
    title: str
    artist: str
    album: str = ''
    duration_sec: int = 0
    tags: tuple[str, ...] = ()
    source: ProviderSource = 'mock_demo'


@dataclass(frozen=True)
class RecentPlay:
    """近期播放记录（脱敏，只保留曲目与播放次数）。"""

    track_id: str
    title: str
    artist: str
    play_count: int = 0
    last_played_at: str = ''
    source: ProviderSource = 'mock_demo'


@dataclass(frozen=True)
class UserMusicProfile:
    """用户音乐画像。仅包含用户已授权的数据范围。"""

    user_id: str
    display_name: str
    age_band: str
    city: str
    gender: str
    favorite_tracks: tuple[TrackMetadata, ...] = ()
    top_artists: tuple[str, ...] = ()
    recent_plays: tuple[RecentPlay, ...] = ()
    followed_event_ids: tuple[str, ...] = ()
    playlist_tags: tuple[str, ...] = ()
    authorized_scopes: tuple[str, ...] = ()
    blocked_user_ids: tuple[str, ...] = ()
    reported_user_ids: tuple[str, ...] = ()
    source: ProviderSource = 'mock_demo'
    is_demo: bool = True

    def favorite_titles(self) -> tuple[str, ...]:
        return tuple(track.title for track in self.favorite_tracks)

    def recent_titles(self) -> tuple[str, ...]:
        return tuple(play.title for play in self.recent_plays)


@dataclass(frozen=True)
class EventContext:
    """演出上下文：活动信息 + 同场观众 + 公开集合建议。"""

    event_id: str
    title: str
    artist: str
    city: str
    venue: str
    starts_at: str
    doors_open: str = ''
    age_policy: str = ''
    hot_tracks: tuple[str, ...] = ()
    setlist: tuple[str, ...] = ()
    attendee_user_ids: tuple[str, ...] = ()
    meeting_point: dict[str, str] = field(default_factory=dict)
    safety_tips: tuple[str, ...] = ()
    source: ProviderSource = 'mock_demo'
    is_demo: bool = True


class TMEDataProvider(ABC):
    """音乐数据统一抽象接口。所有实现必须保持行为一致。"""

    name: str = 'base'
    source: ProviderSource = 'mock_demo'
    disclaimer: str = MOCK_DISCLAIMER

    @abstractmethod
    def get_user_music_profile(self, user_id: str) -> UserMusicProfile | None:
        """返回用户已授权的音乐画像；查不到返回 None。"""

    @abstractmethod
    def get_event_context(self, event_id: str) -> EventContext | None:
        """返回演出上下文（含同场观众 ID 列表）；查不到返回 None。"""

    @abstractmethod
    def get_track_metadata(self, track_ids: list[str]) -> list[TrackMetadata]:
        """按 ID 批量取曲目元数据；未知 ID 直接跳过，不填占位数据。"""

    def search_tracks(self, query: str) -> list[TrackMetadata]:
        """把自然语言里提到的歌名解析成曲目元数据（官方 API 对应搜索接口）。

        默认实现返回空列表：调用方必须把"没解析到"当成正常结果处理，
        不能假设用户提到的歌一定存在。
        """

        return []

    def describe(self) -> dict[str, object]:
        """给前端展示的数据源说明。"""

        return {
            'provider': self.name,
            'source': self.source,
            'isDemo': self.source == 'mock_demo',
            'disclaimer': self.disclaimer,
        }


def get_tme_provider(name: str | None = None) -> TMEDataProvider:
    """按配置返回数据提供方。默认 mock；official 需要在 official_tme.py 中实现。"""

    from app.config import settings
    from app.integrations.mock_qqmusic import MockQQMusicProvider
    from app.integrations.official_tme import OfficialTMEProvider

    selected = (name or settings.tme_provider or 'mock').strip().lower()
    if selected in {'official', 'tme', 'official_tme'}:
        return OfficialTMEProvider()
    return MockQQMusicProvider()