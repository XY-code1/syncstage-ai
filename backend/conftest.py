"""让 pytest 能直接 import app 包，并让单元测试默认不连真实大模型。

真实大模型的验收由以下两处覆盖：
- tests/test_chat.py（用 httpx.MockTransport 断言真实请求与错误映射）
- frontend/scripts/e2e-llm.mjs（对着真实运行中的模型端到端验收）
"""

import importlib
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import Settings  # noqa: E402  (必须在 sys.path 之后导入)

# 所有测试默认使用的"未配置大模型"设置：完全确定性、不依赖本机 .env
OFFLINE_SETTINGS = Settings(
    openai_model='',
    openai_api_key='',
    openai_api_style='openai',
    ai_force_fallback=False,
)

SETTINGS_MODULES = (
    'app.config',
    'app.db',
    'app.integrations.base',
    'app.agent.tools.intent',
    'app.routers.agent',
    'app.routers.health',
    'app.routers.ai',
    'app.services.ai_client',
    'app.services.conversation',
    'app.services.agent_service',
    'app.services.agent_runs',
    'app.services.llm.gateway',
    'app.routers.agent_run',
)


@pytest.fixture(autouse=True)
def offline_ai(monkeypatch):
    """默认关闭真实大模型；需要真实调用的测试在自己的 fixture 里覆盖 settings。"""

    for name in SETTINGS_MODULES:
        module = importlib.import_module(name)
        if hasattr(module, 'settings'):
            monkeypatch.setattr(module, 'settings', OFFLINE_SETTINGS)
    yield
