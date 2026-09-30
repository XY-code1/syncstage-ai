# SyncStage 技术架构

QQ音乐「一起去现场」是腾讯音乐高校 AI 黑客松赛道一概念功能，服务演出开始前与候场期间的独自观演用户。

## 前端

- React + TypeScript + Vite + Tailwind CSS
- 六段主链路：演出详情、画像授权、对话与确认、Agent 执行、结果与邀请、临时房间
- Hash Router 保证静态部署可直接访问
- 本地 Mock Agent 与后端 Agent 使用同形状态和工具轨迹

## Agent

`parse_social_intent → get_authorized_music_profile → get_event_context → search_same_event_candidates → apply_safety_constraints → rank_candidates → build_group → generate_grounded_reason → send_mutual_consent_invitation → create_temporary_room`

工具基于输入、授权范围和同场候选实时计算结果，不是固定进度动画。安全过滤由确定性程序执行；模型只用于意图理解与有依据文案，失败时回退到本地规则。

## 数据

后端只通过 `TMEDataProvider` 读取音乐画像和演出上下文。当前实现为 `MockQQMusicProvider`，官方适配器只有接口占位。API Key 只允许进入后端环境变量。

## 安全边界

- 同场、年龄、性别、人数、见面意愿、拉黑举报属于排序前硬过滤。
- 双方确认之前禁止创建房间。
- 只建议公开集合点，位置共享默认关闭。
- 房间在活动结束 24 小时后自动归档。

> 本作品为参赛概念Demo，当前使用模拟数据，未调用QQ音乐官方内部API。
