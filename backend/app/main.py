'''SyncStage · FastAPI 入口。

Phase 1 以可演示的前端为主，后端只提供真实数据接口与 AI 预留能力：
    uvicorn app.main:app --reload --port 8000
'''

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
from app.demo_data import DEMO_NOTICE
from app.routers import agent, ai, concerts, health, matching, safety

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(
    title='SyncStage · 一起去现场 API',
    description=DEMO_NOTICE,
    version='0.1.0',
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=['GET', 'POST', 'OPTIONS'],
    allow_headers=['*'],
)

app.include_router(health.router)
app.include_router(agent.router)
app.include_router(concerts.router)
app.include_router(matching.router)
app.include_router(ai.router)
app.include_router(safety.router)

