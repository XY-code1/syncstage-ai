"""工具 1：get_music_profile —— 读取用户已授权的 QQ 音乐数据。"""

from __future__ import annotations

from app.agent.tools.registry import ToolContext, ToolResult


def run(ctx: ToolContext, user_id: str = '', scopes: list[str] | None = None) -> ToolResult:
    target = user_id or ctx.state.user_id
    profile = ctx.provider.get_user_music_profile(target, scopes=scopes)
    if profile is None:
        return ToolResult(
            payload=None,
            input_summary='user_id=' + target + '，授权范围=' + str(scopes or '全部'),
            output_summary='没有找到这个用户的音乐画像',
            status='error',
        )

    ctx.state.music_profile = profile
    summary = (
        '收藏 ' + str(len(profile.favorite_tracks)) + ' 首 · 常听歌手 ' + str(len(profile.top_artists)) + ' 位'
        + ' · 近期播放 ' + str(len(profile.recent_plays)) + ' 条'
        + ' · 关注演出 ' + str(len(profile.followed_event_ids)) + ' 场'
        + ' · 歌单标签 ' + str(len(profile.playlist_tags)) + ' 个'
    )
    return ToolResult(
        payload=profile,
        input_summary='user_id=' + target + '，授权范围=' + '、'.join(scopes or list(profile.authorized_scopes)),
        output_summary='读取到脱敏音乐画像：' + summary,
        status='ok',
    )