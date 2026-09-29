# 同频现场 SyncStage

> QQ音乐演出场景下的AI同好匹配与安全破冰功能

[演示脚本](./docs/demo-script.md) · [技术架构](./docs/architecture.md) · [接口契约](./docs/api.md) · [路线图](./docs/roadmap.md)

## 项目定位

「同频现场」是一个**模拟嵌入 QQ 音乐演出详情页的移动端 H5 概念功能**，由 Agent 驱动。

用户从演出详情页进入，**授权脱敏的音乐偏好数据**，然后用**一句自然语言**说清自己想找什么样的人。
Agent 自主调用音乐画像、同场候选检索、安全过滤、排序、组队与解释工具，在**双方确认之后**创建临时同频房间，
交付**有证据的匹配理由**、**音乐破冰话题**与**公开集合建议**；散场后留下一张现场回忆卡。

一句话：**在同一场演出里，找到听同一首歌的人，并且安全地见上一面。**

## 腾讯音乐高校 AI Hackathon 赛道一定位

SyncStage 面向赛道一的音乐场景创新：围绕演出前后的真实社交需求，用可解释匹配、安全约束和临时协作房间，探索音乐平台从内容消费到线下体验连接的可能性。项目是高校 Hackathon 原型，**不是腾讯或 QQ 音乐官方产品**。

## QQ 音乐概念功能入口

| 融合点 | 在本 Demo 中的体现 |
| --- | --- |
| 场景入口 | 默认入口就是模拟 QQ 音乐演出详情页：海报、歌手、时间、地点、票价、本场预期曲目、同行安全提示 |
| 品牌色 | 只借鉴 QQ 音乐的绿色 `#31c27c` 作为点缀色，深色现场视觉；**不复制 QQ 音乐受版权保护的完整界面** |
| 数据授权 | 独立授权页，逐项勾选：收藏歌曲 / 常听歌手 / 近期播放 / 关注演出 / 歌单标签，并实时给出脱敏预览 |
| 数据来源 | 统一走后端 `TMEDataProvider` 适配层，Agent **不允许直接读取 JSON 文件** |
| 产品标识 | 全站显著标注「QQ音乐 · 概念功能 Demo · 非官方页面」 |

> **初赛暂未提供 TME 官方 API，当前使用脱敏 Demo 数据模拟；入围后可替换官方测试 API。**
>
> 本 Demo **没有**接入真实 QQ 音乐账号，也**没有**调用任何 TME 官方接口，所有演出、用户、歌曲均为虚构内容。

## SyncStage Agent 工作流

用户先输入自然语言需求 → Agent 解析意图 → **用户确认结构化意图** → 读取授权音乐画像 → 检索同场候选人 →
确定性安全过滤 → 打分排序并尝试组队 → 只用真实 evidence 生成理由 → **进入 pending_confirmation** →
**双方都确认后**才创建临时房间。

六个展示阶段（前端进度页依次点亮）：

```
理解你的意图 → 读取授权音乐偏好 → 检索同场候选人 → 执行安全约束 → 计算同频程度 → 生成同频方案
```

Agent 的十个工具（后端 `backend/app/agent/tools/`，标准流水线用到前八个）：

| 工具 | 作用 |
| --- | --- |
| `parse_social_intent` | 把自然语言解析成活动、歌曲、目的、交流风格、人数与安全偏好 |
| `get_music_profile` | 通过 `TMEDataProvider` 读取用户**已授权**的音乐画像 |
| `get_event_context` | 读取演出信息、同场观众范围与公开集合建议 |
| `search_event_candidates` | 在本场观众里检索候选人 |
| `apply_safety_constraints` | 六条硬条件过滤：同场 / 年龄段 / 性别 / 组队人数 / 见面意愿 / 拉黑举报 |
| `rank_candidates` | 四维加权打分并产出 `score_breakdown` 与 `evidence` |
| `build_group` | 在达标候选人里组队；人数不足时**缩小规模**而不是降低标准 |
| `generate_grounded_reason` | 只用 evidence 里真实存在的共同点生成理由，并做引用校验 |
| `create_room` | 双方确认后创建临时房间（未确认调用会被拒绝） |
| `collect_feedback` | 记录用户反馈，用于后续调整权重 |

**执行规则**（后端 `orchestrator.py` 与前端本地镜像 `src/lib/agentMock.ts` 行为一致）：

1. 匹配理由只能引用 `evidence` 中真实存在的歌曲、歌手与目的，引用校验不通过就退化为短句；
2. 找不到合适对象时返回 `no_match`，**绝不编造候选人**；
3. 创建房间、共享集合区域、保留联系方式之前必须进入 `pending_confirmation`；
4. 只有双方同意后才能调用 `create_room`（后端未确认时返回 **409**）；
5. 大模型不可用时使用**本地规则解析 + 文案模板 fallback**，主链路依然可完整演示。

## 快速开始

环境要求：Node.js 18+（验证于 Node 24）、npm 10+；后端可选，需要 Python 3.11+（验证于 Python 3.13）。

### 1. 前端（演示主入口）

```bash
cd frontend
npm install
npm run dev            # 打开 http://127.0.0.1:5173
```

建议用浏览器设备模拟（iPhone 14 Pro / 390×844）打开；桌面直接访问也可以，页面以手机宽度居中展示。

前端默认是 **auto 数据源**：启动时探测本地后端，连得上就用后端 Agent（真实工具轨迹），连不上自动回退到前端本地镜像链路，保证断网也能完整演示。

### 2. 后端（可选：真实 Agent 工具轨迹 + SQLite）

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate                  # macOS / Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000
```

接口文档：`http://127.0.0.1:8000/docs`。若 8000 端口被占用（Windows 常见 `WinError 10013`），改用 `--port 8010`。

### 3. 环境变量与密钥

```bash
copy .env.example backend\.env            # 后端配置
copy .env.example frontend\.env.local     # 可选：前端覆盖项
```

macOS / Linux 用 `cp` 生成 `backend/.env` 与 `frontend/.env.local`。

- 前端只允许读取 `VITE_` 开头的公开配置；
- **任何 API Key 都不会写进前端，也不会提交到 Git**，`.env` 已被 `.gitignore` 忽略，仓库里只有 `.env.example`；
- 留空 `OPENAI_API_KEY` / `OPENAI_MODEL` 时，后端自动走确定性规则与文案模板，Demo 不依赖网络。

## 演示路径（主链路全部可点击）

```
QQ音乐演出页 → 音乐数据授权 → 自然语言说需求 → 确认 Agent 理解 → Agent 执行进度
→ 匹配结果与证据 → 双方确认 → 临时同频房间 → 现场回忆卡
```

| # | 页面 | 路由 | 看点 |
| --- | --- | --- | --- |
| 0 | 演出列表 | `#/list` | 3 场虚构演出、Demo 标识 |
| 1 | **模拟 QQ 音乐演出详情页（默认入口）** | `#/` 或 `#/concert/night-flight` | 海报、歌手、时间、地点、票价、本场曲目、安全提示、「AI 找同频搭子」入口 |
| 2 | 音乐数据授权 | `.../authorize` | 五类数据逐项授权 + 脱敏预览 + 官方 API 限制说明 |
| 3 | 说出你的需求 | `.../intent` | 一句自然语言 + 示例话术；也可用表单补充细节 |
| 4 | 确认 Agent 理解 | `.../intent/confirm` | 结构化意图，活动/歌曲/目的/风格/人数/性别/见面/年龄段/安全全部可改 |
| 5 | **Agent 执行进度** | `.../agent` | 六个阶段依次点亮；评委模式额外显示工具名、输入输出摘要、耗时与 fallback |
| 6 | 匹配结果与证据 | `.../matches` | 3 位候选人、匹配度、共同歌曲、共同目的、差异点、可核对的理由；「查看依据」抽屉 |
| 7 | 双向确认 | 同页 | 邀请已发出 → 对方已查看 → 双方确认；**未双方确认不会出现进入房间的入口** |
| 8 | 同频临时房间 | `.../room` | 双向确认状态、音乐破冰问题、候场任务、公开集合点、退出与举报 |
| 9 | 现场回忆卡 | `.../memory` | 共同歌曲、现场关键词、成员、一句活动回忆 |

补充页面（保留自 Phase 1，可从需求页进入）：表单式偏好填写 `.../preferences`、音乐标签微调 `.../tags`。

### 「查看 Agent 依据」抽屉

匹配结果页的「查看依据」抽屉会展示：工具调用步骤、使用的数据来源、被排除候选人的规则原因、
每项匹配得分（`score_breakdown`）、推荐理由引用的具体歌曲/歌手/目的，以及**等待用户确认的下一步动作**。

## 评委演示模式

左下角竖标签「演示」打开演示控制台，可以现场切换：

- **评委演示模式**开关：开启后显示 Agent 步骤、工具名称、输入/输出摘要、耗时与 fallback 状态；
  关闭时只显示自然语言进度，不暴露技术日志。
- **三种演示案例**：
  1. 正常匹配成功；
  2. 因安全条件过滤后无匹配（`no_match`，并列出每个人被排除的规则原因）；
  3. 大模型不可用，使用本地 fallback 仍完成匹配。
- **页面状态**：正常流程 / 载入较慢（加载态）/ 网络异常（错误态与重试入口）。

演示案例、评委模式与进度都写入 `sessionStorage`，**刷新页面后演示数据仍然可恢复**。

## 匹配逻辑

**硬条件（不满足直接排除，且会给出规则原因）**：同一场演出、年龄段兼容、性别偏好兼容、组队人数兼容、见面意愿兼容、未被拉黑或举报。

**评分权重（合计 100）**：

| 维度 | 权重 |
| --- | --- |
| 音乐偏好 | 40% |
| 演出期待 | 25% |
| 社交目的 | 20% |
| 交流与安全偏好 | 15% |

接口与前端都会返回 `score_breakdown`（每个维度的权重、得分、说明）与 `evidence`（带数据来源的具体共同点），**不会只返回一个总分**。
同一套权重在后端 `backend/app/agent/scoring.py` 与前端 `frontend/src/lib/scoring.ts` 各实现一次，保证前后端口径一致。

## 技术架构

前端采用 React + TypeScript + Vite + Tailwind CSS，提供移动端优先的 H5 演示；后端采用 Python + FastAPI + SQLite，实现 Agent 编排、可解释匹配与数据提供者抽象。前端可以在后端不可用时回退到本地 Mock 链路。OpenAI 兼容接口仅在后端预留，密钥通过环境变量注入。详细设计见 [docs/architecture.md](./docs/architecture.md)。

## 工程结构

```
frontend/          React 19 + TypeScript + Vite 6 + Tailwind CSS 4（移动端优先，最大宽度 440px）
  src/pages/        演出详情 / 授权 / 需求 / 确认 / Agent 进度 / 匹配 / 房间 / 回忆卡 ...
  src/lib/          tmeMock（前端 TME 适配层）· agentMock（本地 Agent 镜像）· scoring · api（数据源）
  src/store/        session.tsx：演示会话状态，写入 sessionStorage
backend/           Python 3.11+ / FastAPI + SQLite（标准库 sqlite3）
  app/integrations/ TME 数据适配层：base（抽象接口）· mock_qqmusic · official_tme（预留）
  app/agent/        state · orchestrator · schemas · scoring · social · tools/（十个工具）
  app/routers/      agent · concerts · matching · ai · safety · health
docs/              技术架构 / 接口契约 / 演示脚本 / 路线图
```

后端 Agent 只通过 `TMEDataProvider` 读取数据：`get_user_music_profile(user_id)`、`get_event_context(event_id)`、
`get_track_metadata(track_ids)`，因此未来替换官方 API 时不需要改 Agent 逻辑。

## TMEDataProvider 与 MockQQMusicProvider

当前 `TME_PROVIDER=mock`，由 `MockQQMusicProvider` 返回脱敏 Demo 数据。

接入官方测试 API 时只需要三步：

1. 把 `TME_PROVIDER` 改成 `official`，并在后端 `.env` 填 `TME_CLIENT_ID` / `TME_CLIENT_SECRET` / `TME_API_BASE_URL`；
2. 按 `backend/app/integrations/official_tme.py` 里的 `TODO(1..8)` 实现三个方法的真实调用（当前该文件**不会伪造任何实现**，调用会明确抛出 `TMEDataUnavailable`）；
3. 前端与 Agent 的代码不需要改动——`/api/agent/provider` 会返回当前数据源与限制说明，页面上也一直标注着官方 API 限制。

同样的思路适用于大模型：留空 `OPENAI_API_KEY` 就用本地规则与文案模板，配置后自动切换，前后端接口不变。

## 测试与验证

```bash
# 前端
cd frontend
npm run typecheck      # TypeScript 严格模式类型检查
npm run smoke          # 匹配引擎 + Agent 流水线冒烟测试
npm run e2e            # 无头 Chrome 走完整演示路径与三个案例、加载/空结果/错误状态
npm run build          # 生产构建

# 后端（可选）
cd backend
python -m pytest tests -q -p no:cacheprovider
```

验证结果：`npm run typecheck` 通过、`npm run build` 通过、`npm run smoke` **66** 项断言全部通过、`npm run e2e` **83** 项检查全部通过、后端 `pytest` **21** 个测试全部通过。

## Demo 数据

- **3 场虚构演出**：夜航计划（星野回声）/ 潮湿的午夜（沈亦舟）/ 潮汐线（潮汐线乐队），场馆与票价均为虚构；
- **16 位匿名用户 + 1 位 Demo 访客**，每人包含歌曲、歌手、期待曲目、社交目的、交流风格、组队人数、安全偏好；
- 所有演出与用户都带有 `isDemo` 标记，并在页面与接口 `notice` 中明确标注；
- 未使用 TME 官方 API，也没有远程图片：海报是本地 CSS 渐变 + 排版。


## 隐私与安全设计

- **最小化授权**：音乐画像字段逐项授权，界面同步展示脱敏预览。
- **安全先于相似度**：同场、年龄段、性别偏好、组队人数、见面意愿与拉黑举报先做硬过滤，再进行匹配评分。
- **双向确认**：双方同意前不创建房间，不共享集合信息，不交换私人联系方式。
- **公开集合**：只推荐场馆入口、服务台等公开区域，不提供精确定位与实时轨迹。
- **短生命周期**：临时房间面向单场活动，支持退出和举报；原型不实现永久聊天。
- **密钥隔离**：API Key 只允许存在于后端环境变量；`.env`、数据库、日志、缓存与构建产物均被 Git 忽略。
- **Demo 数据**：仓库中的演出、歌曲、头像和匿名成员均为虚构示例，不包含真实个人信息。
## 当前限制与后续计划

- 不做复杂登录、支付、真实票务、精确位置与完整聊天系统；
- 未接入 TME 官方 API 与真实 QQ 音乐账号，匹配池是脱敏 Demo 数据；
- 「双方确认」由 Demo 模拟对方客户端（定时推进），不是真实双端推送；
- 大模型为预留接口，默认走本地规则与模板，不依赖网络；
- 视觉上只借鉴 QQ 音乐品牌绿，不复制其受版权保护的界面。

后续计划包括：在获得授权后接入官方测试 API、完善用户研究与安全评估、增加真实端到端测试、优化小组匹配与解释质量。详细路线见 [路线图](./docs/roadmap.md)。
