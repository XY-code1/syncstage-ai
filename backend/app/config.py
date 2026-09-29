'''环境配置：只从环境变量 / .env 读取，绝不把任何密钥写进代码或前端。'''

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file() -> None:
    '''极简 .env 读取，避免引入额外依赖；已存在的环境变量优先。'''
    env_path = BASE_DIR / '.env'
    if not env_path.exists():
        return
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
            'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173',
        )
    )
    tme_provider: str = os.getenv('TME_PROVIDER', 'mock')
    ai_force_fallback: bool = os.getenv('AI_FORCE_FALLBACK', '').strip().lower() in {'1', 'true', 'yes'}
    openai_api_key: str = os.getenv('OPENAI_API_KEY', '')
    openai_base_url: str = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
    openai_model: str = os.getenv('OPENAI_MODEL', '')
    openai_timeout: float = float(os.getenv('OPENAI_TIMEOUT', '20'))

    @property
    def db_path(self) -> Path:
        '''把 sqlite:///./data/xxx.db 形式的地址解析成绝对路径。'''
        raw = self.database_url
        if raw.startswith('sqlite:///'):
            relative = raw.replace('sqlite:///', '', 1)
            path = Path(relative)
            return path if path.is_absolute() else (BASE_DIR / path).resolve()
        return (BASE_DIR / 'data' / 'same_frequency.db').resolve()

    @property
    def ai_enabled(self) -> bool:
        '''没有配置 Key 或模型时，后端自动使用确定性规则回退。'''
        if self.ai_force_fallback:
            return False
        return bool(self.openai_api_key.strip() and self.openai_model.strip())

    @property
    def ai_fallback_reason(self) -> str:
        '''说明为什么走本地回退，前端会原样展示给评委。'''
        if self.ai_force_fallback:
            return 'forbidden'
        if not self.openai_api_key.strip():
            return 'no_api_key'
        if not self.openai_model.strip():
            return 'no_model'
        return 'ready'

    @property
    def chat_completions_url(self) -> str:
        return self.openai_base_url.rstrip('/') + '/chat/completions'


settings = Settings()
