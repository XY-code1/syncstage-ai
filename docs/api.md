# SyncStage · 接口契约

Base URL：`http://127.0.0.1:8000`（可用 `.env` 的 `PORT` 调整；前端通过 `VITE_API_BASE_URL` 指向它）

所有接口返回 JSON，字符集 UTF-8。Demo 模式下所有数据均为虚构内容。
> 注意：Windows 上 8000 端口可能被系统保留（`WinError 10013`），改用 `--port 8010` 并同步设置 `VITE_API_BASE_URL` 即可。

## 健康检查

`GET /api/health`

```json
{
  "status": "ok",
  "env": "development",
  "aiEnabled": false,
  "demoData": true,
  "notice": "本项目所有演出、用户与互动内容均为 Demo 演示数据……"
}
```

`aiEnabled` 为 `false` 表示未配置大模型，此时解析与文案全部走本地规则回退。
前端也用这个接口做数据源探测（可达则使用后端 Agent）。

## Agent（主链路）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/agent/provider` | 数据源说明：`mock_qqmusic` / `isDemo` / 官方 API 限制 / `tmeProvider` / `aiEnabled` |
| GET | `/api/agent/tools` | 十个工具清单与标准流水线（评委模式展示用） |
| POST | `/api/agent/intent/parse` | 只做第一步：自然语言 → 结构化意图（供用户确认） |
| POST | `/api/agent/sessions` | 跑完整条流水线，返回带证据的匹配结果与完整 trace |
| GET | `/api/agent/sessions/{sessionId}` | 取回会话（刷新/恢复用），不存在返回 404 |
| POST | `/api/agent/sessions/{sessionId}/invite` | 发起方确认邀请对象，进入 `pending_confirmation` |
| POST | `/api/agent/sessions/{sessionId}/peer-confirm` | Demo：模拟受邀方确认；未邀请先确认返回 409 |
| POST | `/api/agent/sessions/{sessionId}/room` | 双方确认后创建临时房间；**未确认返回 409** |
| POST | `/api/agent/sessions/{sessionId}/feedback` | 记录反馈 |

### POST /api/agent/sessions

请求：

```json
{
  "eventId": "night-flight",
  "userId": "u-viewer",
  "text": "我第一次看星野回声，最喜欢《夜航的信》，想找人一起排队候场、副歌一起唱，3 个人以内，只在公开场合见面。",
  "authorizedScopes": ["favorite_songs", "top_artists", "recent_plays", "followed_events", "playlist_tags"],
  "parsedIntent": null,
  "demoCase": "normal"
}
```

`demoCase`：`normal` | `safety_no_match` | `ai_fallback`。
`parsedIntent` 不为空时，用前端确认过的结构化意图覆盖解析结果。

响应（关键字段）：

```json
{
  "sessionId": "…",
  "status": "pending_confirmation",
  "parsedIntent": { "purposes": ["副歌一起唱"], "groupSize": 3, "safety": ["只在公开场合见面"] },
  "excludedCandidates": [{ "userId": "u-07", "nickname": "不说话的鼓手", "rule": "见面意愿不兼容", "reason": "…" }],
  "rankedCandidates": [
    {
      "userId": "u-08",
      "score": 87,
      "band": "high",
      "scoreBreakdown": {
        "total": 87,
        "dimensions": [
          { "id": "music", "weight": 40, "points": 36, "detail": "…" },
          { "id": "expected", "weight": 25, "points": 22, "detail": "…" },
          { "id": "social", "weight": 20, "points": 17, "detail": "…" },
          { "id": "style_safety", "weight": 15, "points": 12, "detail": "…" }
        ],
        "formula": "音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全 15%"
      },
      "evidence": [
        { "kind": "song", "text": "你们都喜欢《夜航的信》", "source": "favorite_songs", "sourceLabel": "收藏歌曲", "items": ["夜航的信"] }
      ],
      "matchReason": "你们都想在现场听到《夜航的信》；都想「副歌一起唱」……"
    }
  ],
  "proposedGroup": { "size": 3, "members": [], "meetingPoint": { "name": "…", "time": "…" } },
  "pendingConfirmation": { "required": true, "status": "awaiting_user", "nextAction": "invite" },
  "trace": [{ "name": "parse_social_intent", "phase": "understand", "status": "fallback", "usedFallback": true, "durationMs": 12, "inputSummary": "…", "outputSummary": "…" }]
}
```

约定：

- `status` 为 `no_match` 时 `rankedCandidates` 为空，且**不会编造候选人**；
- 匹配理由只引用 `evidence` 中真实存在的条目；
- 未进入 `pending_confirmation` 之前不得创建房间。

## 演出与其他数据接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/concerts` | 演出列表，返回 `{ notice, items }` |
| GET | `/api/concerts/{concertId}` | 演出详情，找不到返回 404 |
| GET | `/api/concerts/{concertId}/attendees` | 本场标记同频意愿的匿名观众 |
| GET | `/api/concerts/{concertId}/room-tasks` | 候场任务清单 |
| POST | `/api/concerts/{concertId}/memory-card` | 旧版兼容端点，当前主演示链路不再使用 |
| POST | `/api/concerts/{concertId}/matches` | 兼容旧表单式偏好的匹配入口（同样返回 `scoreBreakdown` + `evidence`） |
| POST | `/api/concerts/{concertId}/icebreakers` | 生成音乐破冰问题 |
| POST | `/api/ai/tags` | 生成结构化音乐标签（未配置大模型时走规则） |
| POST | `/api/safety/invites` | 邀请安全校验 |
| POST | `/api/safety/reports` | 举报（匿名） |

## 前端如何切换数据源

前端默认 **auto**：

1. 启动时探测 `GET /api/health`（1.2 秒超时）；
2. 可达 → 使用后端 Agent（真实工具轨迹）；
3. 不可达 → 回退到前端本地镜像链路（同样的工具序列与评分规则），保证断网也能演示。

强制指定：`VITE_USE_MOCK_API=true`（只用本地）或 `false`（必须走后端）。

## 大模型接入（预留）

- 后端读取 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` / `OPENAI_TIMEOUT`；
- 任意一项缺失，或 `AI_FORCE_FALLBACK=true`，则 `ai_enabled=False`，解析与文案走本地规则与模板；
- 所有密钥只存在于后端环境变量，**前端拿不到、也不会被提交到 Git**；
- 前端接口不因是否接入模型而变化。

## TME 官方 API 接入（预留）

1. 后端 `.env` 设置 `TME_PROVIDER=official`、`TME_CLIENT_ID`、`TME_CLIENT_SECRET`、`TME_API_BASE_URL`；
2. 按 `backend/app/integrations/official_tme.py` 的 `TODO(1..8)` 实现三个方法（当前全部抛 `TMEDataUnavailable`，不伪造实现）；
3. Agent、路由与前端无需改动。

