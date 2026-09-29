"""工具契约：ToolContext / ToolResult / ToolSpec。

每个工具的 run(ctx, **kwargs) 只通过 ToolContext 取数据：
- ToolContext.provider 是 TMEDataProvider（音乐 / 演出数据）
- 社交偏好通过 app.agent.social 读取
工具内部不允许直接读 JSON 文件或写死的原始字典。
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.agent.state import AgentState, ToolStatus
from app.integrations.base import TMEDataProvider


@dataclass
class ToolResult:
    """一次工具调用的返回值 + 给评委看的输入输出摘要。"""

    payload: Any = None
    input_summary: str = ''
    output_summary: str = ''
    status: ToolStatus = 'ok'
    used_fallback: bool = False


@dataclass
class ToolContext:
    provider: TMEDataProvider
    state: AgentState
    cache: dict[str, Any] = field(default_factory=dict)


ToolFn = Callable[..., ToolResult]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    label: str
    description: str
    phase: str
    run: ToolFn