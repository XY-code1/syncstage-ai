# 同频现场 · 技术架构

## 一句话定位

「同频现场」是**模拟嵌入 QQ 音乐演出详情页的移动端 H5 概念功能**：用户授权脱敏音乐偏好、用自然语言说清需求，
由 Agent 自主调用音乐画像、同场检索、安全过滤、排序、组队与解释工具，在**双方确认后**创建临时同频房间。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite 6（HashRouter，移动端优先，最大宽度 440px） |
| 样式 | Tailwind CSS 4，深色现场视觉，QQ 音乐绿 `#31c27c` 仅作点缀 |
| 前端状态 | React Context + `sessionStorage` 持久化（刷新后演示进度可恢复） |
| 后端 | Python 3.11+ / FastAPI + SQLite（标准库 `sqlite3`） |
| 数据源抽象 | `TMEDataProvider`，当前实现为 `MockQQMusicProvider`（脱敏 Demo 数据） |
| 大模型 | OpenAI 兼容 `chat/completions`，未配置时自动使用确定性规则 + 文案模板 |

## 目录结构

```
frontend/src
  pages/         演出详情 · 授权 · 需求 · 意图确认 · Agent 进度 · 匹配结果 · 房间 · 回忆卡（+ 偏好表单、标签微调）
  components/    QQMusicBar / MockNotice · JudgeBanner · AgentEvidence("查看依据"抽屉) · DemoConsole · Poster · ui
  lib/           tmeMock(前端 TME 适配层) · agentMock(本地 Agent 镜像) · scoring(评分) · api(数据源路由) · content · tags · matching(兼容层)
  store/         session.tsx：演示会话状态（授权、意图、Agent、房间、回忆卡、评委模式、案例）
backend/app
  integrations/  base.py(抽象接口) · mock_qqmusic.py(Demo 数据) · official_tme.py(官方 API 预留，全部 TODO)
  agent/         state.py · orchestrator.py · schemas.py · scoring.py · social.py · tools/(十个工具)
  routers/       agent · concerts · matching · ai · safety · health
  db.py          SQLite：sessions / rooms / feedback
docs/            技术架构 · 接口契约 · 演示脚本 · 路线图
```

## 腾讯音乐融合：TME 数据适配层

```
Agent tools ──► TMEDataProvider (integrations/base.py)
                    ├── MockQQMusicProvider   TME_PROVIDER=mock    （当前，默认）
                    └── OfficialTMEProvider   TME_PROVIDER=official（预留，方法全部抛 TMEDataUnavailable）
```

统一接口：

| 方法 | 返回 |
| --- | --- |
| `get_user_music_profile(user_id, scopes)` | 脱敏音乐画像：收藏歌曲、常听歌手、近期播放、关注演出、歌单标签（按授权范围裁剪） |
| `get_event_context(event_id)` | 演出信息、同场观众范围、公开集合建议 |
| `get_track_metadata(track_ids)` | 曲目元数据（歌名、歌手、专辑、标签） |

**约束**：Agent 工具不允许直接读取 JSON 文件，必须经 `TMEDataProvider` 获取数据。
这样替换官方 API 时只改 `integrations/`，Agent、路由与前端都不需要改动。

当前 `provider.describe()` 会如实返回：

```json
{
  "provider": "mock_qqmusic",
  "source": "mock_demo",
  "isDemo": true,
  "disclaimer": "初赛暂未提供 TME 官方 API，当前使用脱敏 Demo 数据模拟；入围后可替换官方测试 API。"
}
```

## Agent 状态机

`agent/state.py` 的 `AgentState` 字段：

`session_id` · `user_id` · `event_id` · `raw_intent` · `parsed_intent` · `music_profile` · `candidate_ids` ·
`excluded_candidates` · `ranked_candidates` · `proposed_group` · `evidence` · `pending_confirmation` · `room_id` · `status` · `error` ·
`authorized_scopes` · `scenario` · `trace` · `phases` · `provider_info`

状态流转：

```
collecting_intent → running → pending_confirmation → (双方确认) → room_created
                        ↘ no_match          （所有候选人被硬条件排除，不编造候选人）
                        ↘ error             （工具异常 / 模型不可用且无法回退）
```

- `pending_confirmation` 是**创建房间的必经关口**：`create_room` 工具在双方确认前会直接拒绝（HTTP 409）。
- 每个工具调用都会写入 `trace`（工具名、阶段、输入摘要、输出摘要、耗时、状态、是否 fallback），
  前端据此渲染六个阶段与评委模式日志。

## Agent 工具（`agent/tools/`）

标准流水线（`PIPELINE`，与前端六个阶段一一对应）：

```
parse_social_intent → get_music_profile → get_event_context → search_event_candidates
→ apply_safety_constraints → rank_candidates → build_group → generate_grounded_reason
（另有 create_room、collect_feedback，共十个工具）
```

| 工具 | 关键实现 |
| --- | --- |
| `parse_social_intent` | 规则解析为主；配置了大模型时可用模型覆盖；`force_fallback` 演示「模型不可用」 |
| `get_music_profile` | 经 `TMEDataProvider` 读取，按 `authorized_scopes` 裁剪 |
| `get_event_context` | 演出信息 + 同场观众范围 + 公开集合建议 |
| `search_event_candidates` | 同场候选人检索（不跨场推荐） |
| `apply_safety_constraints` | 六条硬条件，确定性规则，输出 `excluded_candidates`（含规则与原因） |
| `rank_candidates` | 四维加权打分 + `evidence` 生成 |
| `build_group` | 达标阈值 `QUALIFY_MIN_SCORE`；人数不足时缩小规模而非降低标准 |
| `generate_grounded_reason` | 只用 evidence 生成理由，并做引用校验（`unsupported_quotes`） |
| `create_room` | 校验双方确认状态；未确认直接拒绝 |
| `collect_feedback` | 记录反馈到 SQLite（Demo） |

## 匹配引擎（`agent/scoring.py` ⇄ `src/lib/scoring.ts`）

硬条件（任一不满足即排除，并给出规则原因）：

1. 同一场演出；2. 年龄段兼容；3. 性别偏好兼容；4. 组队人数兼容；5. 见面意愿兼容；6. 未被拉黑或举报。

评分权重（合计 100）：

| 维度 | 权重 |
| --- | --- |
| 音乐偏好 | 40 |
| 演出期待 | 25 |
| 社交目的 | 20 |
| 交流与安全偏好 | 15 |

`score_breakdown` 会返回每个维度的权重、得分与说明，`evidence` 会带上每条共同点的**数据来源**
（收藏歌曲 / 常听歌手 / 近期播放 / 关注演出 / 歌单标签 / 用户原话）。接口不会只返回一个总分。

## 前端数据流

```
src/lib/api.ts（数据源路由）
  ├── auto 探测 GET /api/health（1.2s 超时）
  │     ├── 可达  → 后端 Agent：POST /api/agent/sessions 等（真实工具轨迹）
  │     └── 不可达 → 前端本地镜像：src/lib/agentMock.ts（同样的工具序列、权重与硬条件）
  └── VITE_USE_MOCK_API=true/false 可强制指定
```

前端本地镜像与后端共用同一套规则定义（`scoring.ts` ⇄ `scoring.py`），因此断网也能完整演示，
且演示结论一致（权重与硬条件完全相同）。所有演示状态写入 `sessionStorage`（`sfl.session.v2` / `sfl.scenario.v2` / `sfl.judge.v2` / `sfl.case.v2`）。

## 演示模式

- **用户模式**：只显示自然语言进度（六个阶段 + 每步的中文结论）。
- **评委模式**：额外显示工具名、工具输入/输出摘要、每步耗时、fallback 状态，顶部显示评委提示条。
- **三个案例**：正常匹配成功 / 安全条件过滤后无匹配 / 大模型不可用走本地 fallback。
- **页面状态**：正常流程 / 载入较慢 / 网络异常。`scenario` 在 mock 与后端两种模式下都生效，方便现场演示。

## 后端设计

- `db.py`：SQLite 表 `sessions`、`rooms`、`feedback`（标准库 `sqlite3`，无 ORM）。
- `orchestrator.py`：内存会话存储（含过期回收）+ 流水线执行；`GET /api/agent/sessions/{id}` 可恢复会话。
- `services/ai_client.py`：OpenAI 兼容调用；未配置 Key 或 `AI_FORCE_FALLBACK=true` 时 `ai_enabled=False`，全程走本地回退。
- 密钥只从环境变量 / `.env` 读取，**不下发前端、不提交 Git**。

## 当前限制

- 未接入 TME 官方 API 与真实 QQ 音乐账号；候选池是脱敏 Demo 数据。
- 不做登录、支付、真实票务、精确位置与完整聊天。
- 「双方确认」由 Demo 定时模拟对方客户端，不是真实双端推送。