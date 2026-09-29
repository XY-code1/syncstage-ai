"""TME（腾讯音乐）数据适配层。

Agent 与业务代码只允许通过 TMEDataProvider 读取音乐与演出数据，
不允许直接读取 JSON / SQLite 里的原始记录，方便未来整体替换为官方测试 API。
"""