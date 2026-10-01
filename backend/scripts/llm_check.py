"""LLM 连通性自检：按当前 API 形态真实发一次请求，打印配置与原始错误。

用法：
    python scripts/llm_check.py                 # 用 backend/.env 的配置
    python scripts/llm_check.py --raw           # 额外打印上游返回片段

自检不会打印 API Key，只会显示是否已配置与长度。
请求地址与请求体都取自 app.config.settings / 与 ai_client 保持一致，
避免出现「应用能跑、自检却报失败」的假阴性。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import httpx  # noqa: E402

from app.config import settings  # noqa: E402

PROBE_MESSAGES = [
    {'role': 'system', 'content': '你是中文助手，回答控制在 20 字以内。'},
    {'role': 'user', 'content': '用一句中文说明你现在能不能正常工作。'},
]


def describe_config() -> None:
    print('== 当前配置 ==')
    print('api_style     :', settings.api_style)
    print('base_url      :', settings.openai_base_url)
    print('model         :', settings.openai_model or '<empty>')
    key = settings.openai_api_key.strip()
    print('api_key       :', ('<set, len=%d>' % len(key)) if key else '<empty>')
    print('timeout       :', settings.openai_timeout)
    print('force_fallback:', settings.ai_force_fallback)
    print('ai_enabled    :', settings.ai_enabled, '/', settings.ai_fallback_reason)
    print('chat_url      :', settings.chat_url)
    print()


def build_payload(think: bool | None) -> dict[str, Any]:
    """按当前 api_style 生成与 ai_client._build_payload 一致的请求体。"""
    if settings.api_style == 'ollama':
        payload: dict[str, Any] = {
            'model': settings.openai_model,
            'messages': PROBE_MESSAGES,
            'stream': False,
            'options': {'temperature': 0.2, 'num_predict': 256},
        }
        if think is not None:
            payload['think'] = think
        return payload
    return {
        'model': settings.openai_model,
        'messages': PROBE_MESSAGES,
        'temperature': 0.2,
        'max_tokens': 256,
    }


def parse_body(data: dict[str, Any]) -> tuple[str, str, str]:
    """兼容 OpenAI 与 Ollama 两种返回体。"""
    if 'choices' in data:
        choice = (data.get('choices') or [{}])[0] or {}
        message = choice.get('message') or {}
        reasoning = message.get('reasoning') or message.get('reasoning_content') or ''
        return str(message.get('content') or ''), str(choice.get('finish_reason') or ''), str(reasoning)
    message = data.get('message') or {}
    return str(message.get('content') or ''), str(data.get('done_reason') or ''), str(message.get('thinking') or '')


def probe(label: str, payload: dict[str, Any], raw: bool) -> bool:
    headers = {'Content-Type': 'application/json'}
    if settings.openai_api_key.strip():
        headers['Authorization'] = 'Bearer ' + settings.openai_api_key.strip()
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=settings.openai_timeout) as client:
            response = client.post(settings.chat_url, json=payload, headers=headers)
        elapsed = (time.perf_counter() - started) * 1000
        print('[%s] HTTP %s  %dms' % (label, response.status_code, elapsed))
        if response.status_code >= 400:
            print('       上游错误体:', response.text[:400])
            return False
        data = response.json()
        content, finish, reasoning = parse_body(data)
        usage = data.get('usage') or {
            'prompt_tokens': data.get('prompt_eval_count'),
            'completion_tokens': data.get('eval_count'),
        }
        print('       finish_reason:', finish)
        print('       content      :', repr(content[:120]) if content else '<empty>')
        print('       reasoning    :', (repr(reasoning[:60]) + '...') if reasoning else '<none>')
        print('       usage        :', usage)
        if raw:
            print('       raw          :', json.dumps(data, ensure_ascii=False)[:600])
        return bool(content.strip())
    except Exception as error:  # noqa: BLE001 - 自检脚本要打印真实原因
        elapsed = (time.perf_counter() - started) * 1000
        print('[%s] FAILED in %dms -> %s: %s' % (label, elapsed, type(error).__name__, error))
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--raw', action='store_true')
    args = parser.parse_args()
    describe_config()
    if not settings.openai_model.strip():
        print('未配置 OPENAI_MODEL，无法自检。请在 backend/.env 里补上。')
        return 2
    if not settings.ai_enabled:
        print('当前配置下真实大模型被判定为不可用，原因：', settings.ai_fallback_reason)
        return 2

    probes: list[tuple[str, dict[str, Any]]] = [('default', build_payload(None))]
    if settings.api_style == 'ollama':
        # 关掉思考过程，避免小模型把 token 全花在 reasoning 上导致正文为空
        probes.append(('think_false', build_payload(False)))

    results: list[tuple[str, bool]] = []
    for label, payload in probes:
        results.append((label, probe(label, payload, args.raw)))
        print()
    ok = any(value for _, value in results)
    print('结论：', '大模型链路可用' if ok else '全部失败，请检查 base_url / model / 服务是否启动')
    return 0 if ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
