# 同频现场 · 路线图与当前限制

## Phase 1（已完成）：可点击、可演示的前端 MVP

- 六个移动端页面：演出详情 → 偏好填写 → 标签确认 → 匹配结果 → 同频临时房间 → 现场回忆卡。
- 3 场虚构演出、16 位匿名用户，全部标记为 Demo 数据；无远程图片，海报为本地渐变。

## Phase 2（已完成）：QQ 音乐融合 + Agent 编排

**腾讯音乐场景融合**

- 默认入口改为**模拟 QQ 音乐演出详情页**，全站标注「QQ音乐 · 概念功能 Demo · 非官方页面」。
- 新增**音乐数据授权页**：收藏歌曲 / 常听歌手 / 近期播放 / 关注演出 / 歌单标签，逐项可授权并给出脱敏预览。
- 明确标注：*初赛暂未提供 TME 官方 API，当前使用脱敏 Demo 数据模拟；入围后可替换官方测试 API。*

**TME 数据适配层**（`backend/app/integrations/`）

- `base.py` 定义 `TMEDataProvider` 抽象接口：`get_user_music_profile` / `get_event_context` / `get_track_metadata`。
- `mock_qqmusic.py` 提供脱敏 Demo 音乐画像、演出与曲目数据。
- `official_tme.py` 只保留官方 API 适配骨架与 `TODO(1..8)`，**不伪造实现**，调用会明确抛 `TMEDataUnavailable`。
- Agent 不允许直接读 JSON，必须经 `TMEDataProvider`。

**Agent Orchestrator**（`backend/app/agent/`）

- `state.py`（含 `raw_intent`、`parsed_intent`、`music_profile`、`candidate_ids`、`excluded_candidates`、
  `ranked_candidates`、`proposed_group`、`evidence`、`pending_confirmation`、`room_id`、`status`、`error`）
- `orchestrator.py` + `schemas.py` + `tools/`（十个工具）
- 规则：用户确认结构化意图 → 读取授权画像 → 同场检索 → 确定性安全过滤 → 打分排序组队 →
  只用真实 evidence 生成理由 → `pending_confirmation` → **双方确认后才创建房间**。
- 找不到合适对象返回 `no_match`，不编造候选人；大模型不可用时走本地规则与模板 fallback。

**前端重构**

- 演示路径：QQ 音乐演出页 → 授权 → 自然语言需求 → 确认意图 → **Agent 执行进度** → 匹配与证据 → 双方确认 → 临时房间 → 回忆卡。
- 新增 **Agent 执行进度页**（六个阶段），以及匹配结果页的 **「查看 Agent 依据」抽屉**
  （工具调用步骤、数据来源、排除原因、每项得分、理由引用的具体条目、等待确认的下一步）。
- 新增**评委演示模式**与三个可切换案例；默认用户模式只显示自然语言进度。

**匹配逻辑**

- 硬条件：同场 / 年龄段 / 性别偏好 / 组队人数 / 见面意愿 / 未拉黑举报。
- 评分：音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全 15%。
- 接口返回 `score_breakdown` 与 `evidence`，不只返回总分。

## Phase 2.5（下一步，优先级从高到低）

1. **接入官方测试 API**：拿到 TME 授权后按 `official_tme.py` 的 TODO 实现三个方法，并用契约测试锁定字段映射。
2. **真实双端确认**：把 Demo 的定时模拟换成真实推送/长连接，`pending_confirmation` 增加超时与撤回。
3. **大模型提示词与评测**：为 `parse_social_intent` 与 `generate_grounded_reason` 建立提示词版本与离线评测集
   （引用校验失败率、意图解析准确率），模型不可用时的回退路径已有。
4. **反馈闭环**：用 `collect_feedback` 的数据做权重微调，并在评委模式下展示调权前后对比。
5. **可访问性与性能**：键盘可达、屏幕阅读器标签、首屏体积与首屏时间预算。

## Phase 3：TME 生态内的完整体验

- 在 QQ 音乐内以小程序 / H5 形式接入真实演出详情与票务信息；
- 演出前的同频推荐、演出中的候场互动、散场后的回忆卡沉淀到用户主页；
- 与主办方安全体系打通（场馆公开集合点、工作人员点位）。

## 当前限制（明确不做）

- 不做复杂登录、支付、真实票务、精确位置、完整聊天系统与硬件集成；
- 未接入 TME 官方 API 与真实 QQ 音乐账号，匹配池为脱敏 Demo 数据；
- 「双方确认」为 Demo 模拟，不是真实双端推送；
- 大模型为预留接口，默认走本地规则与模板；
- 视觉上只借鉴 QQ 音乐品牌绿，不复制其受版权保护的界面。

## 合规与安全清单

- **密钥**：只从后端环境变量 / `.env` 读取，前端只暴露 `VITE_` 公开配置，`.env` 已被 `.gitignore` 忽略。
- **数据**：使用脱敏 Demo 数据，不采集真实用户音乐数据；授权范围可逐项取消。
- **告知**：所有页面标注 Demo 与官方 API 限制；接口 `notice` 字段同样声明。
- **安全设计**：公开集合点、不共享精确位置、不交换联系方式为默认项、可随时退出与匿名举报。
- **不编造**：无匹配即返回 `no_match`；推荐理由必须能在 evidence 中找到出处。