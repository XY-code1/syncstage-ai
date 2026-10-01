"""Agent 真实调用链接口（厂商无关网关）。

- POST /api/agent/parse-intent：自然语言需求 → 结构化条件（Schema 校验，失败最多重试一次）
- POST /api/agent/run        ：跑一次完整流程，返回 runId + 匹配结果 + 轨迹 + 模型使用情况
- GET  /api/agent/runs/{id}  ：读取已有运行结果（刷新页面后不需要重跑）

前端只跟这三个接口打交道，永远不会直接请求 api.deepseek.com，
密钥只存在于后端环境变量里，绝不随任何响应下发。
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException

from app.agent.schemas import AgentRunRequest, IntentParseRequest
from app.services import agent_service as service_module
from app.services.llm import LLMError, http_status_for

logger = logging.getLogger('same_frequency.agent_run')

router = APIRouter(prefix='/api/agent', tags=['agent-run'])


class AgentRunBody(AgentRunRequest):
    """在既有请求体上增加可选的 runId（不修改原有模型）。"""

    runId: str | None = None


def _raise_http(error: LLMError) -> None:
    raise HTTPException(status_code=http_status_for(error), detail=error.to_dict())


@router.post('/parse-intent')
async def parse_intent(payload: IntentParseRequest) -> dict:
    service = service_module.get_service()
    try:
        return await service.parse_intent(
            text=payload.text,
            event_id=payload.eventId,
            user_id=payload.userId,
            scopes=list(payload.authorizedScopes),
        )
    except LLMError as error:
        _raise_http(error)
        raise  # pragma: no cover - _raise_http 一定抛异常


@router.post('/run')
async def run_agent(payload: AgentRunBody) -> dict:
    service = service_module.get_service()
    try:
        return await service.run(
            text=payload.text,
            event_id=payload.eventId,
            user_id=payload.userId,
            scopes=list(payload.authorizedScopes),
            demo_case=payload.demoCase,
            parsed_intent=payload.parsedIntent,
            run_id=payload.runId,
        )
    except LLMError as error:
        _raise_http(error)
        raise  # pragma: no cover
    except ValueError as error:
        # 同一个 runId 已经在运行：不重复启动，也不并发重跑
        raise HTTPException(status_code=409, detail=str(error)) from error


@router.get('/runs/{run_id}')
def read_run(run_id: str) -> dict:
    snapshot = service_module.get_service().get_run(run_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail='这个运行记录不存在或已过期')
    return snapshot