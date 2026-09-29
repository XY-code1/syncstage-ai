'''AI 相关接口（标签抽取）。没有配置大模型时返回规则结果。'''

from fastapi import APIRouter

from app.schemas import PreferencesPayload
from app.services.ai_client import extract_tags

router = APIRouter(prefix='/api/ai', tags=['ai'])


@router.post('/tags')
async def read_tags(payload: PreferencesPayload) -> dict:
    return await extract_tags(payload.as_dict())
