"""Agent 运行登记表。

保证「一次任务只创建一个 runId、同一个 runId 不得重复启动」：
- 内存实现（初赛 Demo 足够），带 TTL 与容量上限，长时间运行也不会无限增长；
- 同一个 runId 处于 running 时再次启动会被拒绝，而不是并发重跑；
- 刷新页面后前端可以先 GET /api/agent/runs/{runId} 拿回结果，不需要重新跑一遍。
"""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

RUN_TTL_SECONDS = 30 * 60
MAX_RUNS = 50


def new_run_id() -> str:
    """每次任务只有一个 runId，由后端生成；前端不允许伪造/复用。"""

    return 'run-' + uuid.uuid4().hex


@dataclass
class AgentRun:
    run_id: str
    status: str = 'running'
    created_at: float = 0.0
    updated_at: float = 0.0
    snapshot: dict[str, Any] = field(default_factory=dict)
    error: dict[str, Any] | None = None
    steps: int = 0

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            'runId': self.run_id,
            'status': self.status,
            'createdAt': self.created_at,
            'updatedAt': self.updated_at,
            'steps': self.steps,
        }
        if self.snapshot:
            payload.update(self.snapshot)
        if self.error:
            payload['error'] = self.error
        return payload


class AgentRunRegistry:
    def __init__(self) -> None:
        self._runs: dict[str, AgentRun] = {}
        self._lock = threading.Lock()

    def begin(self, run_id: str) -> AgentRun:
        """登记一次运行；同一个 runId 已在运行时抛 ValueError（路由会转成 409）。"""

        with self._lock:
            self._gc_locked()
            # 同一个 runId 只能启动一次：无论上一次是 running / done / error 都拒绝重跑，
            # 需要重跑时由前端生成新的 runId（一次任务 = 一个 runId）。
            if run_id in self._runs:
                raise ValueError('这个 runId 已经执行过，不会重复启动；需要重跑请生成新的 runId')
            run = AgentRun(run_id=run_id, status='running', created_at=time.time(), updated_at=time.time())
            self._runs[run_id] = run
            return run

    def finish(self, run_id: str, snapshot: dict[str, Any], *, steps: int = 0) -> AgentRun:
        with self._lock:
            run = self._runs.get(run_id) or AgentRun(run_id=run_id, created_at=time.time())
            run.status = 'done'
            run.snapshot = snapshot
            run.steps = steps
            run.updated_at = time.time()
            self._runs[run_id] = run
            return run

    def fail(self, run_id: str, error: dict[str, Any]) -> AgentRun:
        with self._lock:
            run = self._runs.get(run_id) or AgentRun(run_id=run_id, created_at=time.time())
            run.status = 'error'
            run.error = error
            run.updated_at = time.time()
            self._runs[run_id] = run
            return run

    def get(self, run_id: str) -> AgentRun | None:
        with self._lock:
            self._gc_locked()
            return self._runs.get(run_id)

    def clear(self) -> None:
        with self._lock:
            self._runs.clear()

    def _gc_locked(self) -> None:
        now = time.time()
        stale = [key for key, run in self._runs.items() if now - run.updated_at > RUN_TTL_SECONDS]
        for key in stale:
            self._runs.pop(key, None)
        if len(self._runs) > MAX_RUNS:
            for key, _ in sorted(self._runs.items(), key=lambda item: item[1].updated_at)[: len(self._runs) - MAX_RUNS]:
                self._runs.pop(key, None)


registry = AgentRunRegistry()


__all__ = ['AgentRun', 'AgentRunRegistry', 'MAX_RUNS', 'RUN_TTL_SECONDS', 'new_run_id', 'registry']
