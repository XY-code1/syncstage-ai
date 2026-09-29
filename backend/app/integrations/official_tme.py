"""OfficialTMEProvider：未来接入 TME 官方测试 API 的适配位。

初赛阶段【没有】官方 API 权限，因此本文件只保留适配骨架与 TODO，
不包含任何伪造实现：所有方法都会抛出 TMEDataUnavailable(reason='not_implemented')。

接入步骤（入围后）：
  TODO(1) 在 TME 开放平台申请演出 / 曲库 / 用户授权三类测试接口权限；
  TODO(2) 把 client_id / client_secret 放进 backend/.env（禁止提交 Git、禁止下发前端）；
  TODO(3) 在 _access_token() 中实现 client_credentials 或授权码换 token，并加本地缓存；
  TODO(4) 实现 get_user_music_profile：调用"用户音乐画像"接口，
          并且只请求用户在前端授权页勾选过的 scope（authorized_scopes）；
  TODO(5) 实现 get_event_context：调用"演出详情 / 演出观众"接口，
          观众列表必须只返回脱敏 ID，不得返回昵称、头像等可识别信息；
  TODO(6) 实现 get_track_metadata / search_tracks：调用曲库接口，注意批量上限与 QPS 限制；
  TODO(7) 补全限流重试、超时、错误码映射（把官方错误码映射到 TMEDataUnavailable.reason）；
  TODO(8) 增加契约测试：用官方沙箱返回的样本数据跑 backend/tests/test_agent.py 同一套断言。
"""

from __future__ import annotations

import os
from collections.abc import Iterable

from app.integrations.base import (
    EventContext,
    TMEDataProvider,
    TMEDataUnavailable,
    TrackMetadata,
    UserMusicProfile,
)


class OfficialTMEProvider(TMEDataProvider):
    """官方 API 适配位。当前未实现，调用即报错，绝不返回编造数据。"""

    name = 'official_tme'
    source = 'official_tme'
    disclaimer = '官方 TME 测试 API 尚未接入，当前不可用。'

    def __init__(self) -> None:
        self.client_id = os.getenv('TME_CLIENT_ID', '')
        self.client_secret = os.getenv('TME_CLIENT_SECRET', '')
        self.base_url = os.getenv('TME_API_BASE_URL', '')

    def _unavailable(self, feature: str) -> TMEDataUnavailable:
        return TMEDataUnavailable(
            '官方 TME 测试 API 尚未接入（' + feature + '）。请设置 TME_PROVIDER=mock 使用脱敏 Demo 数据。',
            reason='not_implemented',
        )

    def get_user_music_profile(
        self, user_id: str, scopes: Iterable[str] | None = None
    ) -> UserMusicProfile | None:
        # TODO(4) 调用官方"用户音乐画像"接口，并按 scopes 裁剪返回字段。
        raise self._unavailable('用户音乐画像')

    def get_event_context(self, event_id: str) -> EventContext | None:
        # TODO(5) 调用官方"演出详情 / 同场观众"接口。
        raise self._unavailable('演出上下文')

    def get_track_metadata(self, track_ids: list[str]) -> list[TrackMetadata]:
        # TODO(6) 调用官方曲库批量查询接口。
        raise self._unavailable('曲目元数据')

    def search_tracks(self, query: str) -> list[TrackMetadata]:
        # TODO(6) 调用官方曲库搜索接口。
        raise self._unavailable('曲目搜索')

    def describe(self) -> dict[str, object]:
        payload = super().describe()
        payload.update(
            {
                'configured': bool(self.client_id and self.client_secret and self.base_url),
                'implemented': False,
                'todo': [
                    '申请 TME 开放平台测试接口权限',
                    '实现 token 获取与缓存',
                    '实现音乐画像 / 演出上下文 / 曲库三个接口',
                    '补全限流重试与错误码映射',
                    '用官方沙箱样本跑通契约测试',
                ],
            }
        )
        return payload