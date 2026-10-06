# Design QA — 同频现场核心流程

Viewport: 390×844. Source targets: the three user-provided mobile references.

Current captures: `docs/screenshots/p0-00-home.png`, `p0-03-agent-intent.png`,
`p0-04a-agent-running.png`, `p0-05a-match-reveal.png`,
`20-invitation-01-sender-waiting.png`, `p0-08-temporary-room.png`.

- PASS：首页是全屏演出现场，绿/紫双轨、黑胶与单一主 CTA 清晰。
- PASS：任务确认保持一页四项摘要，技术过程折叠，不改解析逻辑。
- PASS：执行页展示真实阶段、已浏览/已筛除数量和当前动作，并支持暂停、继续、修改条件与结束任务。
- PASS：结果页使用票根结构和真实匹配分数，邀请必须由用户明确触发。
- PASS：waiting / declined / expired / cancelled 由原双向确认状态机驱动，未确认不建房。
- PASS：正文基础字号 15px；主按钮 52px；返回和次操作触控区至少 44px。
- PASS：390×844 无横向溢出，固定底部操作无遮挡。

Remaining P3: Demo 头像继续匿名化；未复制参考图中的版权摄影与粒子素材；生产包仍有约 638 kB 的单块 JS，可在赛后按路由拆包。

**final result: passed**

## 2026-10-06 — Agent / 消息 / 真人聊天 / 编辑资料

Viewport: 390×844. Reference: `codex-clipboard-bd990fd0-6c81-4f0c-8135-76f9638486de.png`.
Captures: `ui-01-agent-icebreak.png`, `ui-02-agent-summary-invite.png`,
`ui-03-messages.png`, `ui-04-human-chat.png`, `ui-05-edit-profile.png`.

- PASS：五页复用晚霞演唱会背景、米白纸张、蓝紫玻璃和荧光绿主操作的统一 token；未把参考图作为页面背景。
- PASS：Agent 破冰与总结页沿用真实 Agent trace、候选数据与邀请状态机，音乐卡保留波形、光带与轻微节拍响应。
- PASS：消息页保留主应用底部导航；Agent、真人聊天和编辑资料页均在沉浸式布局中隐藏导航。
- PASS：真人聊天沿用本地持久化与模拟回复逻辑，模拟消息显式标注「Demo模拟回复」。
- PASS：编辑资料保留头像上传、字段校验、可见范围和资料保存逻辑，头像回退为安全 Demo 人像而非字母占位。
- PASS：每页仅有一个主滚动区域，390×844 无横向溢出并适配 safe-area。

Remaining P3: 用户只提供了一张包含消息、聊天、资料三栏的合成稿；两张 Agent 页面据同一材质与色彩系统延展，没有臆造第二张未提供的视觉稿内容。

**final result: passed**

## 2026-10-06 — 选歌 / 搜索 / 揭晓连续镜头

Viewport: 390×844. Reference: `codex-clipboard-5c95f0f8-204e-4e01-8f7f-0428a4778809.png`.
Captures: `signal-01-select-song.png`, `signal-02-searching.png`, `signal-03-reveal-sealed.png`, `signal-continuity-comparison.png`.

- PASS：三页复用同一夏日晚霞演唱会背景，搜索阶段通过 48% 蓝紫蒙版进入夜色，揭晓阶段恢复暖色。
- PASS：选歌页用米白实体票卡替换圆球/黑色播放器，保留切歌、试听、进度和歌曲持久化。
- PASS：搜索页复用缩小音乐卡，彩色双轨、萤火粒子和观众头像围绕卡片，不展示技术日志与后台统计。
- PASS：三个用户阶段由真实 trace 完成状态驱动；暂停、继续、更多菜单及自动进入揭晓仍沿用原状态机。
- PASS：普通转场 220ms，共享卡片变形 480ms；reduced-motion 关闭复杂动画。
- PASS：390×844 无横向溢出、无双返回按钮、主按钮无遮挡。

Remaining P3: Demo 环境暂时复用同一张已授权虚构人物头像作为多个观众光点；后续有更多授权素材时可替换，不影响流程。

**final result: passed**
