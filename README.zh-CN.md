# QQ音乐「一起去现场」· SyncStage

> QQ音乐演出场景下的AI同好匹配与安全破冰功能

[3 分钟演示脚本](./docs/demo-script.md) · [信息架构](./docs/information-architecture.md) · [技术架构](./docs/architecture.md) · [接口契约](./docs/api.md) · [路线图](./docs/roadmap.md)

## 项目定位

**功能名称：QQ音乐「一起去现场」**  
**副标题：面向独自观演用户的 AI 同行组队 Agent。**

**技术项目名：SyncStage**

SyncStage 不是独立音乐社交产品，而是腾讯音乐高校 AI Hackathon 赛道一的 **QQ音乐现有平台 1→N 概念功能创新**：从已有的听歌、收藏、歌单、歌手、一起听和关注演出能力，延伸到演唱会前的 AI 同频同行匹配。

> **QQ音乐已经解决听什么，一起去现场进一步解决和谁共同抵达音乐现场。**

用户从 QQ音乐演出详情概念页点击「一起去现场」，授权脱敏的模拟音乐画像，再用自然语言描述同行需求。Agent 调用候选检索、安全过滤、排序、组队和解释工具；双方确认后创建限时房间，双方确认后创建仅服务演出前和候场期间的临时同行房间。

## 腾讯音乐高校 AI Hackathon 赛道一定位

SyncStage 面向赛道一，以 QQ音乐现有内容与用户音乐资产为起点，通过演出详情页内的新入口，把“听什么”自然延展到“和谁共同抵达”。项目是高校 Hackathon 原型，**不是腾讯或 QQ 音乐官方产品**。

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

## 产品信息架构

产品一级导航固定为四项：**首页 / 同频 / 消息 / 我的**。

| 一级 Tab | 主任务 |
| --- | --- |
| **首页** | 一眼看到下一步：开始匹配或回到进行中的房间，并选择演出 |
| **同频** | 人与匹配优先：进行中的匹配/房间 + 推荐同频用户（头像、同频度、共同音乐偏好、共同演出、推荐理由） |
| **消息** | Agent 通知、群聊与临时房间、私聊、系统通知；同行房间以群聊形态出现在列表里（最后一条消息、时间、未读数、集合状态），点进去直达房间；一级聊天室支持语音入口与 Agent 集合建议卡片 |
| **我的** | 头像昵称、音乐画像摘要、演出数/匹配数/同频好友数，以及编辑资料、我的演出、同频好友、音乐画像与授权、隐私与安全、Agent 设置、设置入口 |

**核心原则**：一级页面的主要任务在 1～1.5 个 iPhone 390×844 屏幕内完成；复杂解释、Agent 工具轨迹与权限详情全部下沉到二级页面、Bottom Sheet 或折叠详情，不允许 3～5 屏连续纵向卡片堆叠（`npm run screens` 会实测每个核心页面的屏幕数）。

演出主链路仍然是二级流程：`演出详情 → 音乐画像授权 → Agent 对话及需求确认 → Agent 匹配进度 → 匹配结果与邀请 → 双向确认后的临时同行房间`。

完整页面路由、工具职责与数据字段见 [信息架构](./docs/information-architecture.md)。

## SyncStage Agent 工作流

用户先输入自然语言需求 → Agent 解析意图 → **用户确认结构化意图** → 读取授权音乐画像 → 检索同场候选人 →
确定性安全过滤 → 打分排序并尝试组队 → 只用真实 evidence 生成理由 → **进入 pending_confirmation** →
**双方都确认后**才创建临时房间。

一级进度页只讲人话：屏幕中心是用户头像与两条反向旋转的音乐轨道，候选头像以声波节点从四周出现，五个阶段依次点亮：

```
读取音乐画像 → 寻找同场听众 → 检查安全边界 → 核对同行方式 → 生成破冰理由
```

五个阶段与后端真实流水线一一对应（`parse_social_intent` + `get_music_profile` / `search_event_candidates` / `apply_safety_constraints` / `rank_candidates` / `build_group` + `generate_grounded_reason`）；没通过硬条件的人只会柔和淡出，不出现红叉或淘汰文案。跑完先播 800ms 汇合动画，再进入同频汇合页。全部工具调用记录（工具名、所属阶段、输入输出摘要、耗时、fallback、被排除的人、得分构成）完整保留在「查看 Agent 工作过程」二级页面 `#/concert/:concertId/trace`；普通界面不出现 provider / model / token / 耗时 / 工具次数 / fallback。

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
- 没有配置真实大模型时，后端会明确说明原因（`no_model` / `no_api_key`），前端照原样展示；只有显式设置 `AI_FORCE_FALLBACK=1` 时才会返回**带 `demo-fallback` 标记**的本地模板结果。

### 4. 真实大模型（ChatRoom 对话 / 意图解析 / 破冰 / 标签）

支持两类接口形态，用 `OPENAI_API_STYLE` 切换（不填时按 base_url 端口自动判断）：

| 形态 | 适用 | 关键配置 |
| --- | --- | --- |
| `openai` | OpenAI 及任何兼容 `/chat/completions` 的网关 | `OPENAI_BASE_URL`、`OPENAI_MODEL`、`OPENAI_API_KEY` |
| `ollama` | 本机 Ollama 原生 `/api/chat`（可关闭思考过程，响应快） | `OPENAI_BASE_URL=http://127.0.0.1:11434/v1`、`OPENAI_MODEL=<模型名>`，本地服务**不需要 API Key** |

```bash
# 例：用本机 Ollama 跑真实模型
ollama pull qwen3.5:0.8b
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8020
# backend/.env 写入：
#   OPENAI_BASE_URL=http://127.0.0.1:11434/v1
#   OPENAI_MODEL=qwen3.5:0.8b
#   OPENAI_API_STYLE=ollama
```

自检与查看状态：

```bash
cd backend
.venv\Scripts\python.exe scripts/llm_check.py     # 真实往返一次，打印配置、耗时与原始错误
curl http://127.0.0.1:8020/api/ai/status            # 当前模型 / 接口 / 是否配置 Key（不含 Key）
curl -X POST http://127.0.0.1:8020/api/ai/diagnose  # 真实调用一次模型，失败时返回明确错误码
```

**不静默回退**：`POST /api/agent/chat` 在模型失败时返回带 `code`（`auth_failed` / `timeout` / `connection` / `model_not_found` / `empty_content` …）、`message`、`hint` 的错误体，HTTP 状态对应 401 / 429 / 502 / 504；聊天室会把原因显示出来并提供「重试这条消息」，绝不会用预设文案伪装成模型回复。

### 5. Agent 运行模式（mock / live）

Agent 匹配有且只有两种运行模式，由环境变量决定，页面不会自己猜：

| 变量 | 位置 | 默认 | 说明 |
| --- | --- | --- | --- |
| `VITE_AGENT_MODE` | `frontend/.env.local` | `mock` | `mock` = Demo 模拟 Agent；`live` = 真实模型 Agent |
| `AGENT_MODE` | `backend/.env` | `mock` | 只有后端也设为 `live` 且模型配置有效时才允许真实调用 |

- **mock（初赛默认）**：只用本地 JSON / TypeScript 数据，**不访问任何外部大模型 API**；六个固定步骤（理解需求 → 读取授权画像 → 检索同场候选人 → 安全条件过滤 → 结构化协商 → 生成 3 位候选人），每步约 500ms，总时长 3~5 秒；跑完先播 800ms「双轨汇合」动画，再停在同频汇合页 `#/concert/:concertId/reveal` 并浮出同行票根。页面上会明确标注「Demo 模拟 Agent」，不会伪装成模型输出。旧的匹配列表 `#/concert/:concertId/matches` 仍然可用。
- **live**：先探测后端 `/api/ai/status`。只有 `enabled=true` 且 `agentMode=live` 才进入运行；否则**不进入加载动画、不重复发请求**，直接显示「尚未配置大模型服务」+ 具体原因（`no_api_key` / `no_model` / `agent_mode_mock` / `backend_unreachable`），并提供「切换 Demo 模式」按钮。页面不会向你索取 API Key。

统一适配层在 `frontend/src/services/agent/`：`agentProvider.ts`（按环境变量选择 Provider）、`mockAgentProvider.ts`、`liveAgentProvider.ts`、`agentTypes.ts`。对外只暴露 `parseIntent` / `buildMusicProfile` / `searchCandidates` / `filterBySafety` / `negotiateCandidate` / `generateIcebreakers`，页面与 store 都不会直接调用任何大模型 SDK。

**不会无限循环**：一次任务只生成一个 `runId`，同一个 `runId` 不会被启动第二次；整体超时 10 秒，超时即进入 error 状态且**不自动重试**；每一步最多重试 1 次；进入进度页**不会自动运行**，只有用户点击「开始匹配 / 重新运行」才执行；刷新页面会把中断中的任务显式标记为「上次匹配被中断」，不会自动重跑；失败后提供「重新运行」与「返回修改需求」。

## 核心视觉语言：双轨汇合

两条声波轨道代表两个陌生用户，贯穿首页、匹配过程、汇合结果与同行房间：

- **用户轨道**：QQ音乐绿 → 青渐变（`#31f58a → #61c8ff`）；
- **候选人轨道**：蓝 → 紫渐变（`#4a7dff → #825cff`）；
- **匹配成功**：两条轨道在共同歌曲封面处汇合，双方头像移动到交汇点。

实现方式是 SVG + CSS 关键帧（`.track-shift` / `.orbit-spin` / `.node-float`），不引入 3D 库、不使用视频背景。截图与端到端用例都直接断言双轨状态：`data-track-state="apart"`（尚未汇合）→ `"merged"`（已汇合），不接受「只改文案」的假重构。`useVisualBudget()`（`frontend/src/lib/visualBudget.ts`）读取 `prefers-reduced-motion` 与设备算力：开启减少动效时关闭轨迹位移、粒子与旋转，只保留静态状态变化；低性能设备自动降低粒子与模糊。深色音乐风格下，绿色只用于主按钮、当前状态与成功反馈。

## 演示路径（主链路全部可点击）

```
QQ音乐演出详情概念页 → 点击「一起去现场」→ QQ音乐画像授权 → 自然语言说需求 → 确认 Agent 理解 → 双轨动态匹配 → 同频汇合 → 同行票根 → 双方确认 → 消息里的同行房间
```

| # | 页面 | 路由 | 看点 |
| --- | --- | --- | --- |
| 1 | **首页（一级 Tab）** | `#/` | 当前状态卡（开始匹配 / 回到房间）+ 最近两场演出 + 三个快捷入口；底部固定四项导航 |
| 1.5 | 模拟 QQ 音乐演出详情页 | `#/concert/night-flight` | 海报、歌手、时间、地点、票价、本场曲目、安全提示、「一起去现场」入口 |
| 2 | 音乐数据授权 | `.../authorize` | 五类数据逐项授权 + 脱敏预览 + 官方 API 限制说明 |
| 3 | Agent 对话及需求确认 | `.../task` | 自然语言输入后在同页确认歌曲、目的、交流方式、人数与安全条件 |
| 5 | **Agent 匹配进度** | `.../running` | 中心头像 + 两条反向旋转的音乐轨道；候选头像以声波节点从四周出现，五个真实阶段依次点亮，未通过硬条件的人柔和淡出（无红叉 / 无淘汰文案） |
| 5.5 | **查看 Agent 工作过程** | `.../trace` | 全部工具调用记录：工具名、所属阶段、输入输出摘要、耗时、fallback、被排除的人、得分构成 |
| 5.7 | **同频汇合（核心高潮页）** | `.../reveal` | 两条声波从左右汇合到共同歌曲封面、双方头像移到交汇点；只展示共同歌曲 / 同行目的 / 安全边界与一句真实匹配理由（≤2 行、无技术术语），中央是真实综合匹配度「同频 xx%」 |
| 5.8 | **同行票根** | 同页展开 | 演出名称与时间、双方头像、共同歌曲、同行方式、公开集合原则、双方确认状态；底部固定「暂不同行 / 换一位 / 发出同行邀请」，前两个真实可用（拒绝理由只用于下一轮匹配，不通知对方） |
| 6 | 匹配结果与证据 | `.../matches` | 3 位候选人、匹配度、共同歌曲、共同目的、差异点、可核对的理由；「查看依据」抽屉 |
| 7 | 双向确认 | 同页 | 邀请已发出 → 对方已查看 → 双方确认；**未双方确认不会出现进入房间的入口** |
| 8 | 限时房间（消息模块里的群聊） | `.../room` | 一屏式聊天：顶部「‹ 消息」返回、一行集合状态卡、消息区、固定输入区；集合详情与房间设置（成员 / 免打扰 / 举报 / 退出同行）收进 Bottom Sheet；候场任务、共享歌曲、Agent 帮写在输入栏「＋」里，举报与屏蔽需长按消息 |
| 9 | **同频（一级 Tab）** | `#/sync` | 进行中的匹配/房间 + 推荐同频用户卡片（头像、同频度、共同音乐偏好、共同演出、推荐理由） |
| 10 | **消息（一级 Tab）** | `#/messages` | Agent 通知 / 群聊与临时房间 / 私聊 / 系统通知四类会话 |
| 11 | 聊天室 | `#/messages/:threadId` | 消息气泡、输入框、语音入口；Agent 以特殊消息卡片给出集合时间/地点建议 |
| 12 | **我的（一级 Tab）** | `#/me` | 头像昵称、音乐画像摘要、演出数/匹配数/同频好友数、六个二级入口 |


### 「查看 Agent 工作过程」二级页面与「查看 Agent 依据」抽屉

一级进度页只保留五个阶段与结果摘要；完整的工具调用记录在 `#/concert/:concertId/trace` 二级页面，
同一个内容组件也作为匹配结果页的「查看依据」抽屉复用，展示：工具调用步骤（含所属阶段与耗时）、
使用的数据来源、被排除候选人的规则原因、每项匹配得分（`score_breakdown`）、推荐理由引用的具体歌曲/歌手/目的，
以及**等待用户确认的下一步动作**。

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
  src/lib/          tmeMock（前端 TME 适配层）· agentMock（本地 Agent 镜像）· scoring · api（数据源）
  src/pages/        四个一级 Tab（首页 / 同频 / 消息 / 我的）+ 演出主链路与 Agent 工作过程二级页面
  src/components/   TabLayout（底部一级导航）· PageShell（二级页面）· AgentEvidence（工具轨迹共用内容）
  src/store/        session.tsx：演示会话状态，写入 sessionStorage；social.tsx：消息中心与会话
  scripts/          matching-smoke（匹配引擎）· e2e-smoke（完整演示路径）· screen-budget（屏幕预算）
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
npm run e2e:llm        # 真实大模型链路验收（需先启动后端与 dev server）
npm run screens        # 390×844 实测每个核心页面的屏幕数（一级页面 1～1.5 屏）
npm run build          # 生产构建

# 后端（可选）
cd backend
python -m pytest tests -q -p no:cacheprovider
```

验证结果：`npm run typecheck` 通过、`npm run build` 通过、`npm run smoke` **68** 项断言全部通过、`npm run e2e` **154** 项检查全部通过、`npm run e2e:llm` **31** 项真实链路检查全部通过（含真实模型回复、失败与重试、真实语音入口、头像持久化与资料同步）、`npm run screens` 全部核心页面（含 `/me/edit`）在屏幕预算内、后端 `pytest` **30** 个测试全部通过。

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

- 不做复杂登录、支付、真实票务与精确位置；消息中心与聊天室只服务演出前与候场期，不是通用社交 IM；
- 未接入 TME 官方 API 与真实 QQ 音乐账号，匹配池是脱敏 Demo 数据；
- 「双方确认」由 Demo 模拟对方客户端（定时推进），不是真实双端推送；
- 大模型已接入真实调用（`/api/agent/chat` 等），失败时会明确报错并给出重试；只有显式 `AI_FORCE_FALLBACK=1` 才走带标记的 Demo 模板；
- 视觉上只借鉴 QQ 音乐品牌绿，不复制其受版权保护的界面。

后续计划包括：在获得授权后接入官方测试 API、完善用户研究与安全评估、把语音消息与真实双端推送补齐、优化小组匹配与解释质量。详细路线见 [路线图](./docs/roadmap.md)。
