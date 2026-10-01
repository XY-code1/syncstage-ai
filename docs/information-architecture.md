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
| 首页 | 1.5 屏 | 状态卡 + 两场演出 + 三个快捷入口 |
| 同频 | 1.5 屏 | 进行中卡片 + 三张推荐人卡片，详细评分进 Bottom Sheet |
| 消息 | 1.5 屏 | 分类筛选 + 会话列表 |
| 我的 | 1.5 屏 | 画像摘要 + 六个二级入口 |
| 音乐画像授权 | 1.05 屏 | 五行紧凑权限列表，逐项说明进 Bottom Sheet |
| 聊天室 / Agent 进度 | 1.05～1.5 屏 | 固定头尾 + 中间滚动，不再整页堆叠 |

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
| Agent 匹配进度（四阶段） | `#/concert/:concertId/running` |
| **查看 Agent 工作过程（全部工具调用）** | `#/concert/:concertId/trace` |
| 匹配结果 | `#/concert/:concertId/matches` |
| 候选人详情 | `#/concert/:concertId/matches/:candidateId` |
| Agent 预沟通报告 | `#/concert/:concertId/handshake/:candidateId` |
| 临时同行房间 | `#/concert/:concertId/room` |
| 聊天室（Agent 通知 / 群聊 / 私聊 / 系统） | `#/messages/:threadId` |
| 编辑资料（头像 / 昵称 / 生日 / 性别 / 城市 / 签名 / 联系方式 + 可见性） | `#/me/edit` |
| 我的演出 / 同频好友 / 音乐画像与授权 / 隐私与安全 / Agent 设置 / 设置 | `#/me/:section` |

**Bottom Sheet / 折叠详情**：授权项详细解释、推荐人完整评分与证据、Agent 依据抽屉、语音入口、举报、退出房间。

## Agent 匹配四阶段

一级进度页只讲人话，四个阶段依次点亮：

1. **理解需求** —— 把用户原话拆成活动、歌曲、目的与安全边界（`parse_social_intent`）
2. **寻找同场用户** —— 读取授权画像并在本场观众里找人（`get_authorized_music_profile`、`get_event_context`、`search_same_event_candidates`）
3. **计算同频度** —— 先跑确定性安全硬条件，再按四个维度打分（`apply_safety_constraints`、`rank_candidates`）
4. **生成组队方案** —— 生成有证据的理由与公开集合建议（`build_group`、`generate_grounded_reason`、`send_mutual_consent_invitation`、`create_temporary_room`）

完成后**停留在本页**展示候选人数、Top Match（头像、同频度、档位）、匹配理由与共同演出，并提供「查看匹配结果」；全部工具调用记录（工具名、阶段、输入输出摘要、耗时、fallback、被排除的人、得分构成）完整保留在「查看 Agent 工作过程」二级页面。

二级页面（偏好填写、标签微调、匹配结果、候选人详情、预沟通报告、临时房间）统一复用同一条四阶段进度条，不再出现旧的 7 步流程条，避免一级与二级导航语义冲突。

## 演出主链路（二级）

`演出详情 → 音乐画像授权 → Agent 对话及需求确认 → Agent 执行 → 匹配结果与邀请 → 双向确认后的临时同行房间`

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
