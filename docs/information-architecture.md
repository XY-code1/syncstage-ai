# QQ音乐「一起去现场」产品信息架构

**副标题：面向独自观演用户的 AI 同行组队 Agent。**

## 核心边界

产品发生在演出开始前与候场期间，从 QQ音乐已有的演出、收藏歌曲、常听歌手、歌单标签和关注演出数据出发，完成同场候选检索、安全过滤、组队邀请与候场协作。活动结束 24 小时后房间自动归档，不提供持续社交或演出后回忆产品。

> 本作品为参赛概念Demo，当前使用模拟数据，未调用QQ音乐官方内部API。

## 一级导航

产品一级导航固定为四项，其余页面都是这四项的下级页面：

| 一级 Tab | 路由 | 主任务 |
| --- | --- | --- |
| 首页 | `#/` | 一眼看到下一步：开始匹配 / 回到进行中的房间，并选择演出 |
| 同频 | `#/sync` | 人与匹配优先：进行中的匹配或房间 + 推荐同频用户卡片 |
| 消息 | `#/messages` | Agent 通知、群聊与临时房间、私聊、系统通知 |
| 我的 | `#/me` | 头像昵称、音乐画像摘要、演出数/匹配数/同频好友数与二级入口 |

## 屏幕预算

一级页面的主要任务必须在 1～1.5 个 iPhone 390×844 屏幕内完成；复杂解释、Agent 工具轨迹与权限详情全部下沉到二级页面、Bottom Sheet 或折叠详情，不允许出现 3～5 屏连续纵向卡片堆叠。

| 页面 | 预算 | 说明 |
| --- | --- | --- |
| 首页 | 1 屏 | 双轨声波首屏（两条轨道尚未汇合）+ 一句钩子 + 唯一主按钮「开始同频」+ 一张正在匹配的演出卡；390×844 无需滚动 |
| 同频 | 1.5 屏 | 进行中卡片 + 三张推荐人卡片，详细评分进 Bottom Sheet |
| 消息 | 1.5 屏 | 分类筛选 + 会话列表 |
| 我的 | 1.5 屏 | 画像摘要 + 六个二级入口 |
| 音乐画像授权 | 1.05 屏 | 五行紧凑权限列表，逐项说明进 Bottom Sheet |
| 聊天室 / Agent 进度 | 1.05～1.5 屏 | 固定头尾 + 中间滚动，不再整页堆叠 |
| 需求确认（四项摘要） | 1 屏 | 四张摘要卡 + 折叠的「查看 Agent 工作过程」 |
| 匹配中（双轨/轨道） | 1 屏 | 中心头像 + 旋转轨道，五个阶段一句话，证据收进折叠区 |
| 同频汇合 | 1 屏 | 双轨汇合 + 同频度 + 三条关键信息 + 固定底部三操作 |
| 同行票根 | 1 屏（Bottom Sheet） | 票根从汇合页展开，不产生二级滚动条 |

检查方式：`cd frontend && npm run screens`（无头浏览器按 390×844 实测 `scrollHeight`）。

## 页面层级

**一级页面（Tab）**：首页、同频、消息、我的。

**二级页面**：

| 页面 | 路由 |
| --- | --- |
| 全部演出 | `#/concerts` |
| 演出详情（QQ音乐概念页） | `#/concert/:concertId` |
| 音乐画像授权 | `#/concert/:concertId/authorize` |
| Agent 对话及需求确认 | `#/concert/:concertId/task` |
| Agent 匹配进度（双轨声波 · 五阶段） | `#/concert/:concertId/running` |
| **查看 Agent 工作过程（全部工具调用）** | `#/concert/:concertId/trace` |
| **同频汇合（双轨汇合高潮页）** | `#/concert/:concertId/reveal` |
| 匹配结果 | `#/concert/:concertId/matches` |
| 候选人详情 | `#/concert/:concertId/matches/:candidateId` |
| Agent 预沟通报告 | `#/concert/:concertId/handshake/:candidateId` |
| 临时同行房间 | `#/concert/:concertId/room` |
| 聊天室（Agent 通知 / 群聊 / 私聊 / 系统） | `#/messages/:threadId` |
| 编辑资料（头像 / 昵称 / 生日 / 性别 / 城市 / 签名 / 联系方式 + 可见性） | `#/me/edit` |
| 我的演出 / 同频好友 / 音乐画像与授权 / 隐私与安全 / Agent 设置 / 设置 | `#/me/:section` |

**Bottom Sheet / 折叠详情**：授权项详细解释、推荐人完整评分与证据、Agent 依据抽屉、语音入口、集合详情（地图 / 到达状态 / 成员确认 / 安全说明）、房间设置（成员列表 / 消息免打扰 / 举报 / 退出同行）、候场任务、Agent 帮写草稿、举报。

## 核心视觉语言：双轨汇合

两条声波轨道代表两个陌生用户，贯穿首页、匹配过程、汇合结果与同行房间。用户轨道是 QQ音乐绿 → 青渐变，候选人轨道是蓝 → 紫渐变，匹配成功时在共同歌曲封面处汇合。实现只用 SVG + CSS 关键帧，DOM 上带 `data-visual` / `data-track-state` 标记（`apart` / `converging` / `merged`），端到端用例直接断言这三个状态，避免「只改文案」的假重构；`useVisualBudget()` 统一处理 `prefers-reduced-motion` 与低算力设备降级。

## Agent 匹配五阶段

一级进度页只讲人话，屏幕中心是用户头像与两条反向旋转的音乐轨道，候选头像以声波节点从四周出现，五个阶段依次点亮（与后端真实流水线一一对应）：

1. **读取音乐画像** —— 理解意图并读取已授权画像（`parse_social_intent`、`get_authorized_music_profile`）
2. **寻找同场听众** —— 读取演出上下文并在本场观众里检索（`get_event_context`、`search_same_event_candidates`）
3. **检查安全边界** —— 确定性硬条件过滤（`apply_safety_constraints`）
4. **核对同行方式** —— 四维打分与组队（`rank_candidates`、`build_group`）
5. **生成破冰理由** —— 只用证据生成理由（`generate_grounded_reason`）

没通过硬条件的人只会柔和淡出，不使用红叉、失败或淘汰文案。完成后先播 600–900ms 汇合动画，再进入 `#/concert/:concertId/reveal` 同频汇合页：两条声波在共同歌曲封面处汇合、双方头像移动到交汇点，只展示共同歌曲 / 同行目的 / 安全边界与一句真实匹配理由，并浮出可展开的**同行票根**（演出名称与时间、双方头像、共同歌曲、同行方式、公开集合原则、双方确认状态）。底部固定「暂不同行 / 换一位 / 发出同行邀请」，前两个真实可用；拒绝理由只用于下一轮匹配，不通知对方；双方确认后才创建消息房间。全部工具调用记录（工具名、阶段、输入输出摘要、耗时、fallback、被排除的人、得分构成）完整保留在「查看 Agent 工作过程」二级页面，普通界面不出现 provider / model / token / 耗时 / 工具次数 / fallback。

二级页面（偏好填写、标签微调、匹配结果、候选人详情、预沟通报告）统一复用同一条四阶段进度条，不再出现旧的 7 步流程条，避免一级与二级导航语义冲突。**同行房间**是「消息」模块里的一个群聊：使用 `100dvh` 一屏式聊天布局（固定顶部栏 / 一行集合状态卡 / 唯一可滚动的消息区 / 固定输入区），不显示流程条；退出同行只发生在房间设置里，返回消息列表不会退出房间。

## 演出主链路（二级）

`演出详情 → 音乐画像授权 → Agent 对话及需求确认（四项摘要确认）→ 双轨动态匹配 → 同频汇合 → 同行票根 → 双方确认 → 消息里的同行房间`

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

安全硬条件由确定性程序在排序前处理，大模型只参与自然语言解析与有依据文案生成；模型失败时切换本地规则 fallback。「同频」一级页面复用同一套硬条件与评分公式，「查看 Agent 工作过程」二级页面完整保留工具调用轨迹。

停用页面：`.../intent/confirm`、`.../preferences`、`.../tags`、`.../playlist`。
