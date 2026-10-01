"""真实大模型链路的验收测试：必须证明"是真实请求 + 失败会被明确暴露"。

用 httpx.MockTransport 替换网络，不会真的发出外部请求。
"""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.services import ai_client, conversation

CHAT_BODY = {
    'threadId': 'group-room-1',
    'threadKind': 'group',
    'concertId': 'night-flight',
    'roomId': None,
    'userId': 'u-viewer',
    'messages': [{'role': 'user', 'content': '几点在哪碰头？我可能会晚十分钟。'}],
}

UNSEEN_INPUT = '我穿蓝色外套，从地铁 2 号口过来，帮我把集合时间往后挪十分钟。'
UNIQUE_REPLY = '收到，集合改到 19:00，在 1F 检票口右侧等，我会在群里同步给大家。'


def _settings(**overrides) -> Settings:
    base = {
        'openai_base_url': 'http://llm.test/v1',
        'openai_model': 'test-model',
        'openai_api_key': 'sk-test-key',
        'openai_timeout': 5.0,
        # 显式指定请求形态，避免受本机 .env 的 OPENAI_API_STYLE 影响
        'openai_api_style': 'openai',
    }
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def llm(monkeypatch):
    """安装测试配置与假上游，返回 (seen_requests, set_handler) 。"""

    seen: list[httpx.Request] = []
    state = {'handler': None}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return state['handler'](request)

    monkeypatch.setattr(ai_client, 'TEST_TRANSPORT', httpx.MockTransport(handler))
    monkeypatch.setattr(ai_client, 'settings', _settings())
    monkeypatch.setattr(conversation, 'settings', ai_client.settings)
    yield seen, state
    ai_client.TEST_TRANSPORT = None


def _json_reply(reply: str, suggestion=None) -> httpx.Response:
    body = {'reply': reply, 'suggestion': suggestion}
    return httpx.Response(
        200,
        json={
            'model': 'test-model',
            'choices': [
                {
                    'message': {'role': 'assistant', 'content': json.dumps(body, ensure_ascii=False)},
                    'finish_reason': 'stop',
                }
            ],
            'usage': {'prompt_tokens': 120, 'completion_tokens': 40},
        },
    )


def test_chat_requires_configuration() -> None:
    """没有配置模型时必须 503，并且明确说明原因，不能返回任何"回复"。"""

    import app.services.ai_client as module

    original = module.settings
    module.settings = _settings(openai_model='')
    try:
        with TestClient(app) as client:
            response = client.post('/api/agent/chat', json=CHAT_BODY)
        assert response.status_code == 503
        detail = response.json()['detail']
        assert detail['code'] == 'not_configured'
        assert 'reply' not in response.json()
    finally:
        module.settings = original


def test_chat_sends_real_request_and_returns_model_output(llm) -> None:
    """真实请求要带上上下文与模型名，返回值必须是上游生成的内容。"""

    seen, state = llm
    state['handler'] = lambda request: _json_reply(
        UNIQUE_REPLY,
        {'title': '集合时间与地点建议', 'place': '1F 检票口右侧', 'time': '19:00', 'note': '公开区域'},
    )

    with TestClient(app) as client:
        response = client.post('/api/agent/chat', json={**CHAT_BODY, 'messages': [{'role': 'user', 'content': UNSEEN_INPUT}]})

    assert response.status_code == 200
    payload = response.json()
    assert payload['source'] == 'model'
    assert payload['agentName'] == '同频 Agent ✨'
    assert payload['reply'] == UNIQUE_REPLY
    assert payload['suggestion']['time'] == '19:00'
    assert payload['requestId']

    # 真的发出了一次 HTTP 请求，且请求体里能看到模型名、用户原话与真实上下文
    assert len(seen) == 1
    request = seen[0]
    assert str(request.url) == 'http://llm.test/v1/chat/completions'
    assert request.headers['authorization'] == 'Bearer sk-test-key'
    body = json.loads(request.content.decode('utf-8'))
    assert body['model'] == 'test-model'
    joined = json.dumps(body, ensure_ascii=False)
    assert UNSEEN_INPUT in joined
    assert '同频 Agent' in joined
    assert '夜航计划' in joined  # 真实演出上下文来自数据库 / Demo 数据


def test_invalid_api_key_surfaces_error(llm) -> None:
    """上游 401 必须原样暴露成明确错误，不能偷偷 fallback。"""

    seen, state = llm
    state['handler'] = lambda request: httpx.Response(401, json={'error': {'message': 'Invalid API key provided'}})

    with TestClient(app) as client:
        response = client.post('/api/agent/chat', json=CHAT_BODY)

    assert response.status_code == 401
    detail = response.json()['detail']
    assert detail['code'] == 'auth_failed'
    assert detail['upstreamStatus'] == 401
    assert 'reply' not in response.json()
    assert len(seen) == 1


def test_timeout_surfaces_error(llm) -> None:
    seen, state = llm

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout('too slow', request=request)

    state['handler'] = handler
    with TestClient(app) as client:
        response = client.post('/api/agent/chat', json=CHAT_BODY)

    assert response.status_code == 504
    assert response.json()['detail']['code'] == 'timeout'


def test_connection_error_surfaces_error(llm) -> None:
    seen, state = llm

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('connection refused', request=request)

    state['handler'] = handler
    with TestClient(app) as client:
        response = client.post('/api/agent/chat', json=CHAT_BODY)

    assert response.status_code == 502
    assert response.json()['detail']['code'] == 'connection'


def test_forced_demo_fallback_is_labelled(monkeypatch) -> None:
    """只有显式 AI_FORCE_FALLBACK 时才回退，而且必须标明这是 Demo 模板。"""

    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:  # pragma: no cover - 不应该被调用
        seen.append(request)
        return _json_reply('不应该出现')

    monkeypatch.setattr(ai_client, 'TEST_TRANSPORT', httpx.MockTransport(handler))
    monkeypatch.setattr(ai_client, 'settings', _settings(ai_force_fallback=True))
    monkeypatch.setattr(conversation, 'settings', ai_client.settings)
    try:
        with TestClient(app) as client:
            response = client.post('/api/agent/chat', json=CHAT_BODY)
        assert response.status_code == 200
        payload = response.json()
        assert payload['source'] == 'demo-fallback'
        assert 'Demo 回退' in payload['reply']
        assert payload['suggestion']['note'].startswith('这是本地模板生成')
        assert seen == []  # 显式回退时不应该产生任何大模型请求
    finally:
        ai_client.TEST_TRANSPORT = None


def test_ai_status_endpoint_hides_key(monkeypatch) -> None:
    monkeypatch.setattr(ai_client, 'settings', _settings())
    with TestClient(app) as client:
        response = client.get('/api/ai/status')
    assert response.status_code == 200
    payload = response.json()
    assert payload['keyConfigured'] is True
    assert 'sk-test-key' not in json.dumps(payload)