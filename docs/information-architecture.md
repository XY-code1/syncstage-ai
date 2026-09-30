# QQ音乐「一起去现场」产品信息架构

**副标题：面向独自观演用户的 AI 同行组队 Agent。**

## 核心边界

产品发生在演出开始前与候场期间，从 QQ音乐已有的演出、收藏歌曲、常听歌手、歌单标签和关注演出数据出发，完成同场候选检索、安全过滤、组队邀请与候场协作。活动结束 24 小时后房间自动归档，不提供持续社交或演出后回忆产品。

> 本作品为参赛概念Demo，当前使用模拟数据，未调用QQ音乐官方内部API。

## 六段主链路

1. QQ音乐演出详情概念页
2. 音乐画像授权弹窗
3. Agent 对话及需求确认页
4. Agent 任务执行页
5. 匹配结果与邀请页
6. 双向确认后的临时同行房间

## 平台资产

- `favorite_tracks`：收藏歌曲重合
- `top_artists`：常听歌手重合
- `playlist_tags`：曲风、场景与听歌氛围
- `followed_event_ids`：关注演出与同场约束
- `recent_plays`：近期偏好补充
- `authorized_scopes`：用户授权边界

没有这些 QQ音乐音乐行为数据，Agent 无法提供可核验的音乐画像证据。

## Agent 工具

1. `parse_social_intent`
2. `get_authorized_music_profile`
3. `get_event_context`
4. `search_same_event_candidates`
5. `apply_safety_constraints`
6. `rank_candidates`
7. `build_group`
8. `generate_grounded_reason`
9. `send_mutual_consent_invitation`
10. `create_temporary_room`

安全硬条件由确定性程序在排序前处理，大模型只参与自然语言解析与有依据文案生成；模型失败时切换本地规则 fallback。

## 路由

| 页面 | 路由 |
| --- | --- |
| 演出详情 | `#/`、`#/concert/:concertId` |
| 音乐画像授权 | `#/concert/:concertId/authorize` |
| 对话及需求确认 | `#/concert/:concertId/intent` |
| Agent 任务执行 | `#/concert/:concertId/agent` |
| 匹配结果与邀请 | `#/concert/:concertId/matches` |
| 临时同行房间 | `#/concert/:concertId/room` |

停用：`.../intent/confirm`、`.../preferences`、`.../tags`、`.../playlist`。
