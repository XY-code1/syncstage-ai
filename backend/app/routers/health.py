'''健康检查与项目元信息。'''

from fastapi import APIRouter

from app.config import settings
from app.demo_data import DEMO_NOTICE

router = APIRouter(tags=['health'])


@router.get('/api/health')
def health() -> dict:
    return {
        'status': 'ok',
        'env': settings.app_env,
        'aiEnabled': settings.ai_enabled,
        'demoData': True,
        'notice': DEMO_NOTICE,
    }
