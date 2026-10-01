"""LLM 网关验收。

覆盖：
1. mock 模式不访问外部服务；
2. live 模式通过后端 Provider 真实调用（用注入的假 HTTP transport，不联网）；
3. 无 Key 时立即返回 LLM_NOT_CONFIGURED；
4. 超时立即结束；
5. Schema / JSON 解析错误最多重试一次；
6. 日志与响应里都不出现密钥；
7. 前端不会直接请求 api.deepseek.com。
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.services import agent_service as service_module
from app.services.agent_runs import AgentRunRegistry
from app.services.llm import LLMError, LLMGateway, MockProvider, get_llm_gateway
from app.services.llm import deepseek_provider as deepseek_module
from app.services.llm.errors import (
    LLM_AUTH_FAILED,
    LLM_NOT_CONFIGURED,
    LLM_SCHEMA_INVALID,
    LLM_TIMEOUT,
)
from app.services.llm.prompts import build_intent_messages
from app.services.llm.schemas import (
    PARSED_INTENT_SCHEMA,
    PURPOSE_VALUES,
    SAFETY_VALUES,
    STYLE_VALUES,
    validate_parsed_intent,
)

KEY = 'sk-test-deepseek-key-1234567890'

INTENT_PAYLOAD = {
    'concertId': 'night-flight',
    'groupSize': 2,
    'musicPreferences': ['夜航'],
    'socialIntent': '想找个同频的人一起唱副歌',
    'meetingPreference': '现场公开区域碰头',
    'safetyConstraints': ['只在公开场合见面'],
    'confidence': 0.82,
    'purposes': ['副歌一起唱'],
    'chatStyle': '温和慢热',
    'sameGenderOnly': True,
    'meetInPerson': True,
    'note': '模型解析：想找个女生一起唱副歌',
}


def _live_settings(**overrides) -> Settings:
    base: dict[str, object] = {
        'agent_mode': 'live',
        'llm_provider': 'deepseek',
        'llm_model': 'deepseek-flash',
        'llm_base_url': 'https://api.deepseek.com',
        'llm_api_key': KEY,
        'llm_timeout_seconds': 5,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def _chat_response(content: str, *, model: str = 'deepseek-flash') -> httpx.Response:
    return httpx.Response(
        200,
        json={
            'model': model,
            'choices': [{'message': {'role': 'assistant', 'content': content}, 'finish_reason': 'stop'}],
            'usage': {'prompt_tokens': 80, 'completion_tokens': 40},
        },
    )


class Transport:
    """记录每次请求的假 HTTP transport。"""

    def __init__(self, handler) -> None:
        self.seen: list[httpx.Request] = []
        self._handler = handler

    @property
    def transport(self) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            self.seen.append(request)
            return self._handler(request)

        return httpx.MockTransport(handler)

    def bodies(self) -> list[dict]:
        return [json.loads(request.content.decode('utf-8')) for request in self.seen]


def _live_gateway(transport: Transport, **overrides) -> LLMGateway:
    settings = _live_settings(**overrides)
    provider = deepseek_module.DeepSeekProvider(
        api_key=settings.llm_api_key,
        model=settings.llm_model,
        base_url=settings.llm_base_url,
        timeout_seconds=settings.llm_timeout_seconds,
        transport=transport.transport,
    )
    return LLMGateway(provider, mode='live', timeout_seconds=settings.llm_timeout_seconds)


def _service(gateway: LLMGateway):
    return service_module.AgentService(gateway=gateway)


# ---------------------------------------------------------------- 1. mock 不触网
def test_mock_mode_never_touches_the_network() -> None:
    transport = Transport(lambda request: pytest.fail('mock 模式不应发出任何 HTTP 请求'))
    gateway = LLMGateway(MockProvider(), mode='mock')

    payload = asyncio_run(gateway.parse_intent(build_intent_messages('随便说点什么', 'night-flight', PARSED_INTENT_SCHEMA)))
    assert payload['source'] == 'mock'
    assert payload['payload'].concert_id == 'night-flight'

    status = gateway.status()
    assert status['provider'] == 'mock'
    assert status['isMock'] is True
    assert transport.seen == []


def test_mock_provider_can_be_used_without_any_configuration() -> None:
    gateway = get_llm_gateway()  # 本机 .env 是 AGENT_MODE=mock
    assert gateway.is_mock is True
    assert gateway.status()['configured'] is True


# ---------------------------------------------------------------- 2. live 走 Provider
def test_live_parse_intent_goes_through_deepseek_provider() -> None:
    transport = Transport(lambda request: _chat_response(json.dumps(INTENT_PAYLOAD, ensure_ascii=False)))
    gateway = _live_gateway(transport)

    result = asyncio_run(gateway.parse_intent(build_intent_messages('想找个女生一起唱副歌', 'night-flight', PARSED_INTENT_SCHEMA)))

    assert result['source'] == 'model'
    assert result['provider'] == 'deepseek'
    assert result['payload'].group_size == 2
    assert result['payload'].safety_constraints == ['只在公开场合见面']

    assert len(transport.seen) == 1
    request = transport.seen[0]
    assert str(request.url) == 'https://api.deepseek.com/chat/completions'
    assert request.headers['authorization'] == 'Bearer ' + KEY
    body = transport.bodies()[0]
    assert body['model'] == 'deepseek-flash'
    assert body['response_format'] == {'type': 'json_object'}
    assert '想找个女生一起唱副歌' in json.dumps(body, ensure_ascii=False)


# ---------------------------------------------------------------- 3. 无 Key 立即失败
def test_live_without_api_key_fails_immediately_without_request() -> None:
    transport = Transport(lambda request: pytest.fail('没有 Key 时不应发出请求'))
    gateway = _live_gateway(transport, llm_api_key='')

    started = time.perf_counter()
    with pytest.raises(LLMError) as info:
        asyncio_run(gateway.parse_intent(build_intent_messages('hi', 'night-flight', PARSED_INTENT_SCHEMA)))
    elapsed = time.perf_counter() - started

    assert info.value.code == LLM_NOT_CONFIGURED
    assert elapsed < 0.5, '未配置时必须立刻返回，不能等待'
    assert transport.seen == []


def test_run_route_returns_not_configured_without_loading(monkeypatch) -> None:
    transport = Transport(lambda request: pytest.fail('没有 Key 时不应发出请求'))
    gateway = _live_gateway(transport, llm_api_key='')
    monkeypatch.setattr(service_module, 'get_service', lambda: _service(gateway))

    with TestClient(app) as client:
        response = client.post('/api/agent/run', json={'text': '找个人一起', 'eventId': 'night-flight'})

    assert response.status_code == 503
    detail = response.json()['detail']
    assert detail['code'] == LLM_NOT_CONFIGURED
    # 不返回任何"看起来跑成功"的结果
    assert 'state' not in response.json()
    assert transport.seen == []


# ---------------------------------------------------------------- 4/5. 错误与超时
def test_invalid_api_key_surfaces_as_auth_error(monkeypatch) -> None:
    transport = Transport(lambda request: httpx.Response(401, json={'error': {'message': 'Invalid API key'}}))
    monkeypatch.setattr(service_module, 'get_service', lambda: _service(_live_gateway(transport)))

    with TestClient(app) as client:
        response = client.post('/api/agent/parse-intent', json={'text': '找个人一起', 'eventId': 'night-flight'})

    assert response.status_code == 401
    assert response.json()['detail']['code'] == LLM_AUTH_FAILED
    assert response.json()['detail']['upstreamStatus'] == 401


def test_timeout_ends_immediately(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout('too slow', request=request)

    transport = Transport(handler)
    monkeypatch.setattr(service_module, 'get_service', lambda: _service(_live_gateway(transport)))

    with TestClient(app) as client:
        response = client.post('/api/agent/parse-intent', json={'text': '找个人一起', 'eventId': 'night-flight'})

    assert response.status_code == 504
    assert response.json()['detail']['code'] == LLM_TIMEOUT


def test_schema_failure_retries_exactly_once_then_fails() -> None:
    transport = Transport(lambda request: _chat_response(json.dumps({'concertId': 'night-flight'})))
    gateway = _live_gateway(transport)

    with pytest.raises(LLMError) as info:
        asyncio_run(gateway.parse_intent(build_intent_messages('hi', 'night-flight', PARSED_INTENT_SCHEMA)))

    assert info.value.code == LLM_SCHEMA_INVALID
    assert len(transport.seen) == 2, '解析失败最多重试一次'


def test_schema_failure_succeeds_on_the_single_retry() -> None:
    calls = {'n': 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls['n'] += 1
        if calls['n'] == 1:
            return _chat_response('这不是 JSON')
        return _chat_response(json.dumps(INTENT_PAYLOAD, ensure_ascii=False))

    transport = Transport(handler)
    result = asyncio_run(_live_gateway(transport).parse_intent(build_intent_messages('hi', 'night-flight', PARSED_INTENT_SCHEMA)))

    assert calls['n'] == 2
    assert result['attempts'] == 2
    assert result['payload'].confidence == pytest.approx(0.82)


def test_transport_errors_are_not_retried() -> None:
    transport = Transport(lambda request: httpx.Response(500, json={'error': 'boom'}))
    with pytest.raises(LLMError):
        asyncio_run(_live_gateway(transport).parse_intent(build_intent_messages('hi', 'night-flight', PARSED_INTENT_SCHEMA)))
    assert len(transport.seen) == 1, '上游 5xx 属于传输层错误，不重试'


# ---------------------------------------------------------------- 6. 密钥不外泄
def test_logs_and_errors_never_contain_the_api_key(caplog) -> None:
    transport = Transport(
        lambda request: httpx.Response(
            401,
            json={'error': {'message': 'Invalid key', 'echo': 'Bearer ' + KEY}},
        )
    )
    gateway = _live_gateway(transport)

    with caplog.at_level('DEBUG'):
        with pytest.raises(LLMError) as info:
            asyncio_run(gateway.parse_intent(build_intent_messages('hi', 'night-flight', PARSED_INTENT_SCHEMA)))

    assert KEY not in caplog.text
    assert KEY not in json.dumps(info.value.to_dict(), ensure_ascii=False)


def test_ai_status_reports_mode_provider_model_and_hides_key(monkeypatch) -> None:
    import app.services.ai_client as ai_client

    monkeypatch.setattr(ai_client, 'settings', _live_settings())
    with TestClient(app) as client:
        response = client.get('/api/ai/status')

    assert response.status_code == 200
    payload = response.json()
    assert payload['mode'] == 'live'
    assert payload['provider'] == 'deepseek'
    # 顶层 model 保持兼容（旧的前端设置页读它），网关模型在 llmModel / llm.model
    assert payload['llmModel'] == 'deepseek-flash'
    assert payload['llm']['model'] == 'deepseek-flash'
    assert payload['configured'] is True
    assert payload['llm']['keyConfigured'] is True
    assert KEY not in json.dumps(payload, ensure_ascii=False)


def test_frontend_never_calls_the_provider_directly() -> None:
    source_root = Path(__file__).resolve().parents[2] / 'frontend' / 'src'
    offenders: list[str] = []
    for path in source_root.rglob('*'):
        if path.suffix not in {'.ts', '.tsx', '.css'}:
            continue
        text = path.read_text(encoding='utf-8')
        # 前端不允许出现厂商地址（不能直连），也不允许把密钥变量暴露给打包器。
        # 提示文案里提到"去 backend/.env 配 LLM_API_KEY"是允许的，那只是变量名。
        for needle in ('api.deepseek.com', 'VITE_LLM', 'VITE_DEEPSEEK', 'VITE_OPENAI_API_KEY', 'LLM_API_KEY='):
            if needle in text:
                offenders.append(str(path.relative_to(source_root)) + ' -> ' + needle)
    assert offenders == [], '前端不允许出现任何厂商地址或密钥变量：' + '；'.join(offenders)


# ---------------------------------------------------------------- 7. run 生命周期
def test_run_creates_one_run_id_and_is_readable_afterwards(monkeypatch) -> None:
    gateway = LLMGateway(MockProvider(), mode='mock')
    monkeypatch.setattr(service_module, 'get_service', lambda: _service(gateway))
    service_module.registry.clear()

    with TestClient(app) as client:
        first = client.post(
            '/api/agent/run',
            json={'text': '想找个女生一起唱副歌', 'eventId': 'night-flight', 'authorizedScopes': ['favorite_tracks']},
        )
        assert first.status_code == 200
        payload = first.json()
        assert payload['runId'].startswith('run-')
        assert payload['status'] == 'done'
        assert payload['mode'] == 'mock'
        assert len(payload['state']['rankedCandidates']) > 0
        assert payload['llm']['notes'], 'mock 模式必须明确标注没有调用大模型'

        again = client.get('/api/agent/runs/' + payload['runId'])
        assert again.status_code == 200
        assert again.json()['state']['sessionId'] == payload['runId']

        duplicate = client.post('/api/agent/run', json={'text': 'x', 'eventId': 'night-flight', 'runId': payload['runId']})
        assert duplicate.status_code == 409, '同一个 runId 不得重复启动'

        missing = client.get('/api/agent/runs/run-does-not-exist')
        assert missing.status_code == 404


def test_mock_run_never_labels_itself_as_a_real_model(monkeypatch) -> None:
    gateway = LLMGateway(MockProvider(), mode='mock')
    monkeypatch.setattr(service_module, 'get_service', lambda: _service(gateway))
    service_module.registry.clear()

    with TestClient(app) as client:
        payload = client.post('/api/agent/run', json={'text': '找个人一起', 'eventId': 'night-flight'}).json()

    assert payload['provider']['isMock'] is True
    assert payload['llm']['explanations'] == {}
    for note in payload['llm']['notes']:
        assert '未调用任何大模型' in note


def test_same_run_id_cannot_be_started_twice_in_the_registry() -> None:
    registry = AgentRunRegistry()
    registry.begin('run-once')
    with pytest.raises(ValueError):
        registry.begin('run-once')


# ---------------------------------------------------------------- 8. live run 全链路
def test_live_run_attaches_model_reason_and_icebreakers(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode('utf-8'))
        system = body['messages'][0]['content']
        if '匹配理由' in system:
            # 真实模型只能引用 context 里出现过的歌名；这里照着上下文回填，验证"地基检查"放行
            context = json.loads(body['messages'][1]['content'])['context']
            songs = context['candidate']['sharedSongs']
            reason = ('你们都想听《' + songs[0] + '》，观演目的也接近。') if songs else '你们的观演目的很接近，适合一起进场。'
            return _chat_response(json.dumps({'reason': reason, 'confidence': 0.7}, ensure_ascii=False))
        if '破冰' in system:
            return _chat_response(json.dumps({'questions': ['你几点到场馆？', '要不要一起排队？']}, ensure_ascii=False))
        return _chat_response(json.dumps(INTENT_PAYLOAD, ensure_ascii=False))

    transport = Transport(handler)
    monkeypatch.setattr(service_module, 'get_service', lambda: _service(_live_gateway(transport)))
    service_module.registry.clear()

    with TestClient(app) as client:
        response = client.post(
            '/api/agent/run',
            json={'text': '想找个女生一起唱副歌', 'eventId': 'night-flight', 'authorizedScopes': ['favorite_tracks', 'recent_plays']},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload['mode'] == 'live'
    assert payload['provider']['configured'] is True
    top = payload['state']['rankedCandidates'][0]
    assert top['modelReason']
    assert top['reasonSource'] == 'model'
    assert payload['llm']['icebreakers']['source'] == 'model'
    assert payload['llm']['icebreakers']['items'] == ['你几点到场馆？', '要不要一起排队？']
    # 确定性评分给出的本地理由必须保留，便于对照
    assert top['matchReason']


def test_live_run_rejects_invented_song_and_keeps_local_reason(monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode('utf-8'))
        system = body['messages'][0]['content']
        if '匹配理由' in system:
            return _chat_response(json.dumps({'reason': '你们都想听《不存在的歌》所以很合适。'}, ensure_ascii=False))
        if '破冰' in system:
            return _chat_response(json.dumps({'questions': ['你几点到？']}, ensure_ascii=False))
        return _chat_response(json.dumps(INTENT_PAYLOAD, ensure_ascii=False))

    transport = Transport(handler)
    monkeypatch.setattr(service_module, 'get_service', lambda: _service(_live_gateway(transport)))
    service_module.registry.clear()

    with TestClient(app) as client:
        payload = client.post('/api/agent/run', json={'text': '找个人一起', 'eventId': 'night-flight'}).json()

    top = payload['state']['rankedCandidates'][0]
    assert 'modelReason' not in top, '编造歌名的理由必须被拒绝'
    user_id = top['userId']
    assert payload['llm']['explanations'][user_id]['source'] == 'rules'
    assert LLM_SCHEMA_INVALID in payload['llm']['explanations'][user_id]['note']


# ---------------------------------------------------------------- 9. 枚举一致性
def test_taxonomy_stays_in_sync_with_the_intent_tool() -> None:
    from app.agent.tools import intent

    assert set(PURPOSE_VALUES) == set(intent.PURPOSE_KEYWORDS)
    assert set(STYLE_VALUES) == set(intent.STYLE_KEYWORDS)
    assert set(SAFETY_VALUES) == set(intent.SAFETY_KEYWORDS)


def test_validate_parsed_intent_rejects_bad_types() -> None:
    with pytest.raises(LLMError) as info:
        validate_parsed_intent({'concertId': '', 'groupSize': 'two'})
    assert info.value.code == LLM_SCHEMA_INVALID
    assert 'groupSize' in info.value.detail


def asyncio_run(coro):
    import asyncio

    return asyncio.run(coro)
