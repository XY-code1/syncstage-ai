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
