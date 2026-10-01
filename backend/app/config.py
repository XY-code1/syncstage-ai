"""环境配置：只从环境变量 / .env 读取，绝不把任何密钥写进代码或前端。"""

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent

LOCAL_HOSTS = {'127.0.0.1', 'localhost', '::1', '0.0.0.0'}


def _load_env_file() -> None:
    """极简 .env 读取，避免引入额外依赖；已存在的环境变量优先。"""
    for env_path in (BASE_DIR / '.env', BASE_DIR.parent / '.env'):
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding='utf-8').splitlines():
            line = raw_line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file()


def _split_origins(value: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in value.split(',') if origin.strip())


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv('APP_ENV', 'development')
    host: str = os.getenv('HOST', '127.0.0.1')
    port: int = int(os.getenv('PORT', '8000'))
    database_url: str = os.getenv('DATABASE_URL', 'sqlite:///./data/same_frequency.db')
    cors_origins: tuple[str, ...] = _split_origins(
        os.getenv(
            'CORS_ORIGINS',
            'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,'
            'http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175',
        )
    )
    tme_provider: str = os.getenv('TME_PROVIDER', 'mock')
    # Agent 运行模式：mock = 初赛 Demo 默认（不访问任何外部大模型 API）；
    # live = 只有检测到有效模型配置后才允许启用（见 ai_enabled）。
    agent_mode: str = os.getenv('AGENT_MODE', 'mock').strip().lower()
    ai_force_fallback: bool = os.getenv('AI_FORCE_FALLBACK', '').strip().lower() in {'1', 'true', 'yes'}
    openai_api_key: str = os.getenv('OPENAI_API_KEY', '')
    openai_base_url: str = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    openai_model: str = os.getenv('OPENAI_MODEL', '')
    openai_timeout: float = float(os.getenv('OPENAI_TIMEOUT', '20'))
    # openai = 标准 /chat/completions；ollama = 本地 Ollama 原生 /api/chat（支持关闭思考）
    openai_api_style: str = os.getenv('OPENAI_API_STYLE', '').strip().lower()

    # ---------------- 厂商无关的大模型网关（app/services/llm）----------------
    # 密钥只有这一个来源：LLM_API_KEY；兼容读取 DEEPSEEK_API_KEY，但内部统一映射为 LLM_API_KEY。
    # 密钥只允许放在 backend/.env，绝不允许写进任何 VITE_ 变量或下发前端。
    llm_provider: str = os.getenv('LLM_PROVIDER', 'deepseek').strip().lower()
    llm_base_url: str = os.getenv('LLM_BASE_URL', 'https://api.deepseek.com').strip()
    llm_model: str = os.getenv('LLM_MODEL', 'deepseek-flash').strip()
    llm_timeout_seconds: float = float(os.getenv('LLM_TIMEOUT_SECONDS', '20'))
    llm_api_key: str = os.getenv('LLM_API_KEY', '').strip() or os.getenv('DEEPSEEK_API_KEY', '').strip()

    @property
    def db_path(self) -> Path:
        """把 sqlite:///./data/xxx.db 形式的地址解析成绝对路径。"""
        raw = self.database_url
        if raw.startswith('sqlite:///'):
            relative = raw.replace('sqlite:///', '', 1)
            path = Path(relative)
            return path if path.is_absolute() else (BASE_DIR / path).resolve()
        return (BASE_DIR / 'data' / 'same_frequency.db').resolve()

    @property
    def base_host(self) -> str:
        try:
            return (urlparse(self.openai_base_url).hostname or '').lower()
        except ValueError:
            return ''

    @property
    def is_local_base_url(self) -> bool:
        return self.base_host in LOCAL_HOSTS

    @property
    def api_style(self) -> str:
        """请求形态：显式配置优先，否则 11434 端口默认按 Ollama 原生接口处理。"""
        if self.openai_api_style in {'openai', 'ollama'}:
            return self.openai_api_style
        try:
            port = urlparse(self.openai_base_url).port
        except ValueError:
            port = None
        return 'ollama' if port == 11434 else 'openai'

    @property
    def chat_completions_url(self) -> str:
        return self.openai_base_url.rstrip('/') + '/chat/completions'

    @property
    def ollama_chat_url(self) -> str:
        return self._root_base + '/api/chat'

    @property
    def chat_url(self) -> str:
        """当前实际会请求的地址，日志与自检都读这里。"""
        return self.ollama_chat_url if self.api_style == 'ollama' else self.chat_completions_url

    @property
    def _root_base(self) -> str:
        base = self.openai_base_url.rstrip('/')
        return base[:-3] if base.endswith('/v1') else base

    @property
    def key_required(self) -> bool:
        """本地推理服务（Ollama 等）不需要 API Key；远程服务必须配置。"""
        return not self.is_local_base_url

    @property
    def ai_enabled(self) -> bool:
        """没有配置模型、或远程服务缺少 Key 时，视为未启用大模型。"""
        if self.ai_force_fallback:
            return False
        if not self.openai_model.strip():
            return False
        if self.key_required and not self.openai_api_key.strip():
            return False
        return True

    @property
    def ai_fallback_reason(self) -> str:
        """说明为什么没有真实模型可用，前端会原样展示给评委。"""
        if self.ai_force_fallback:
            return 'forbidden'
        if not self.openai_model.strip():
            return 'no_model'
        if self.key_required and not self.openai_api_key.strip():
            return 'no_api_key'
        return 'ready'

    @property
    def llm_configured(self) -> bool:
        """live 模式下网关是否真的可以调用：需要 model + API Key。"""

        return bool(self.llm_model.strip()) and bool(self.llm_api_key.strip())

    @property
    def llm_reason(self) -> str:
        """为什么网关不可用（可安全下发前端）。"""

        if self.agent_mode != 'live':
            return 'agent_mode_not_live'
        if not self.llm_model.strip():
            return 'no_model'
        if not self.llm_api_key.strip():
            return 'no_api_key'
        return 'ready'

    def llm_status(self) -> dict[str, object]:
        """网关状态：模式 / Provider / 模型 / 是否配置成功；绝不含 API Key。"""

        return {
            'mode': self.agent_mode,
            'provider': self.llm_provider,
            'model': self.llm_model,
            'baseUrl': self.llm_base_url,
            'timeoutSeconds': self.llm_timeout_seconds,
            'configured': self.llm_reason == 'ready',
            'reason': self.llm_reason,
            'keyConfigured': bool(self.llm_api_key.strip()),
            'liveMode': self.agent_mode == 'live',
        }

    def ai_status(self) -> dict[str, object]:
        """可安全下发到前端的模型状态（绝不含 Key）。"""
        key = self.openai_api_key.strip()
        return {
            'enabled': self.ai_enabled,
            'reason': self.ai_fallback_reason,
            'agentMode': self.agent_mode,
            # 网关（厂商无关）状态：模式 / Provider / 模型 / 是否配置成功
            'mode': self.agent_mode,
            'provider': self.llm_provider,
            'llmModel': self.llm_model,
            'configured': self.llm_reason == 'ready',
            'llm': self.llm_status(),
            'apiStyle': self.api_style,
            'baseUrl': self.openai_base_url,
            'model': self.openai_model,
            'chatUrl': self.chat_url,
            'timeoutSeconds': self.openai_timeout,
            'keyConfigured': bool(key),
            'keyRequired': self.key_required,
            'forceFallback': self.ai_force_fallback,
        }


settings = Settings()
