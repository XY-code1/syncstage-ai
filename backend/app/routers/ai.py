'''AI 相关接口：状态自检、标签抽取、真实对话诊断。没有配置大模型时明确返回原因。'''

from fastapi import APIRouter, HTTPException

from app.schemas import PreferencesPayload
from app.services import ai_client
from app.services.ai_client import LLMError, extract_tags

router = APIRouter(prefix='/api/ai', tags=['ai'])


@router.get('/status')
def read_status() -> dict:
    """前端用来显示"当前是真模型还是规则回退"，绝不含 Key。"""

    return ai_client.settings.ai_status()


@router.post('/tags')
async def read_tags(payload: PreferencesPayload) -> dict:
    return await extract_tags(payload.as_dict())


@router.post('/diagnose')
async def diagnose() -> dict:
    """真实跑一次大模型往返：成功返回模型原文，失败返回明确错误（含 HTTP 状态）。"""

    report = await ai_client.diagnose()
    if not report.get('ok'):
        error = report.get('error') or {}
        raise HTTPException(status_code=ai_client.http_status_for_code(str(error.get('code', ''))), detail=report)
    return report