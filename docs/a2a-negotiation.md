# 临时同行 Agent 结构化协商

每场演出创建一个临时同行 Agent。它只在演出前与候场期工作，活动结束 24 小时后归档；用户可提前销毁并撤回授权。

## 允许交换的匿名字段

`eventId`、模糊到场时间窗、聚合音乐标签、同行目的、交流方式、组队人数、安全硬条件。

## 永不交换

真实姓名、联系方式、精确位置、原始听歌历史，以及任何未授权音乐字段。双方 Agent 不进行自由聊天。

## 协商工具

1. `verify_same_event`
2. `compare_arrival_plan`
3. `compare_music_profile`
4. `compare_social_intent`
5. `negotiate_group_size`
6. `verify_safety_constraints`
7. `identify_conflicts`
8. `generate_handshake_report`

安全硬条件由确定性规则处理。存在差异时写入“待真人确认”，硬条件冲突时停止推荐。只有双方真人确认后才能调用 `create_temporary_room`。

当前实现使用脱敏 Mock 数据，未调用 QQ 音乐官方内部 API。
