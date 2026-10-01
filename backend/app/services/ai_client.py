"""OpenAI 兼容 / Ollama 真实大模型调用。

设计原则（Phase 2 修正）：
1. 真实调用失败时抛出 LLMError，绝不返回伪装的模型输出；
2. 只有显式设置 AI_FORCE_FALLBACK=1 时，调用方才会拿到本地模板结果，
   并且必须带上 source='demo-fallback' 标记，由前端明确展示为 Demo 回退；
3. Key 只从后端环境变量读取，绝不下发前端，也不会写进日志；
4. 每次调用都记录：URL、model、消息条数、HTTP 状态、耗时、错误类型与上游返回片段。
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.config import settings
from app.content import build_icebreakers, build_tag_groups

logger = logging.getLogger('same_frequency.ai')

# 错误码 -> 前端可读文案
ERROR_MESSAGES = {
    'not_configured': '后端还没有配置大模型（缺少 model，或远程服务缺少 API Key）',
    'auth_failed': '大模型拒绝了这次请求：API Key 无效或没有权限',
    'model_not_found': '大模型服务里找不到配置的 model',
    'bad_request': '大模型认为请求格式不合法',
    'rate_limited': '大模型触发了限流，请稍后重试',
    'upstream_error': '大模型服务返回了错误',
    'timeout': '等待大模型响应超时',
    'connection': '无法连接大模型服务',
    'bad_response': '大模型返回的内容无法解析',
    'empty_content': '大模型只输出了思考过程，没有给出正文',
}

TAG_SYSTEM_PROMPT = (
    '你是音乐演出同行匹配助手。请把用户填写的偏好整理成结构化标签，'
    '只输出 JSON，不要输出解释。字段：groups（数组，元素包含 id/title/hint/tags），'
    'summary（一句话中文总结）。tags 必须是简短中文标签。'
)

ICEBREAKER_SYSTEM_PROMPT = (
    '你是演出现场的破冰助手。请基于共同歌曲生成 6 条中文破冰问题，'
    '每条不超过 40 字，语气自然、不提隐私问题。只输出 JSON：{questions: [...]}。'
)


class LLMError(RuntimeError):
    """真实大模型调用失败。前端会原样展示 code / message / hint，绝不静默回退。"""

    def __init__(
        self,
        code: str,
        message: str | None = None,
        *,
        hint: str = '',
        upstream_status: int | None = None,
        detail: str = '',
    ) -> None:
        self.code = code
        self.message = message or ERROR_MESSAGES.get(code, '大模型调用失败')
        self.hint = hint
        self.upstream_status = upstream_status
        self.detail = detail[:600]
        super().__init__(self.message)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            'code': self.code,
            'message': self.message,
            'hint': self.hint,
        }
        if self.upstream_status is not None:
            payload['upstreamStatus'] = self.upstream_status
        if self.detail:
            payload['detail'] = self.detail
        return payload


# 测试注入点：单元测试用 httpx.MockTransport 替换真实网络，生产环境保持 None。
TEST_TRANSPORT: httpx.AsyncBaseTransport | None = None


@dataclass
class LLMResult:
    text: str
    model: str
    style: str
    request_url: str
    finish_reason: str = ''
    elapsed_ms: int = 0
    usage: dict[str, Any] = field(default_factory=dict)
    reasoning: str = ''
    attempts: int = 1


@dataclass
class JsonCall:
    payload: dict[str, Any] | None
    error: LLMError | None = None
    result: LLMResult | None = None


def _headers() -> dict[str, str]:
    headers = {'Content-Type': 'application/json'}
    key = settings.openai_api_key.strip()
    if key:
        headers['Authorization'] = 'Bearer ' + key
    return headers


def _hint_for(code: str) -> str:
    base = settings.openai_base_url
    if code == 'connection':
        return '请确认大模型服务已启动：' + base
    if code == 'auth_failed':
        return '检查后端 .env 里的 OPENAI_API_KEY 是否正确、是否有该模型的权限'
    if code == 'model_not_found':
        return '检查后端 .env 里的 OPENAI_MODEL 是否在 ' + base + ' 上真实存在'
    if code == 'timeout':
        return '模型响应超过 ' + str(settings.openai_timeout) + ' 秒，可调大 OPENAI_TIMEOUT'
    if code == 'not_configured':
        return '在 backend/.env 里配置 OPENAI_BASE_URL / OPENAI_MODEL（本地 Ollama 可免 Key）'
    if code == 'empty_content':
        return '模型可能把 token 都花在思考过程上，请换用非思考模型或调大输出上限'
    return ''


def _map_http_error(status: int, body: str) -> LLMError:
    snippet = body.strip()[:400]
    if status in (401, 403):
        code = 'auth_failed'
    elif status == 404:
        code = 'model_not_found' if 'model' in snippet.lower() else 'bad_request'
    elif status == 429:
        code = 'rate_limited'
    elif 400 <= status < 500:
        code = 'bad_request'
    else:
        code = 'upstream_error'
    return LLMError(
        code,
        hint=_hint_for(code),
        upstream_status=status,
        detail=snippet,
    )


def _build_payload(
    messages: list[dict[str, str]],
    *,
    temperature: float,
    max_tokens: int,
    json_mode: bool,
    with_response_format: bool,
) -> dict[str, Any]:
    if settings.api_style == 'ollama':
        payload: dict[str, Any] = {
            'model': settings.openai_model,
            'messages': messages,
            'stream': False,
            'think': False,
            'options': {'temperature': temperature, 'num_predict': max_tokens},
        }
        if json_mode:
            payload['format'] = 'json'
        return payload

    payload = {
        'model': settings.openai_model,
        'messages': messages,
        'temperature': temperature,
        'max_tokens': max_tokens,
    }
    if json_mode and with_response_format:
        payload['response_format'] = {'type': 'json_object'}
    return payload


def _parse_body(data: dict[str, Any]) -> tuple[str, str, str, dict[str, Any]]:
    """返回 (正文, finish_reason, reasoning, usage)，兼容 OpenAI 与 Ollama 两种返回体。"""
    if 'choices' in data:
        choice = (data.get('choices') or [{}])[0] or {}
        message = choice.get('message') or {}
        content = message.get('content') or ''
        if isinstance(content, list):  # 少数网关会返回分段结构
            content = ''.join(part.get('text', '') for part in content if isinstance(part, dict))
        reasoning = message.get('reasoning') or message.get('reasoning_content') or ''
        return str(content), str(choice.get('finish_reason') or ''), str(reasoning), dict(data.get('usage') or {})

    message = data.get('message') or {}
    content = message.get('content') or ''
    reasoning = message.get('thinking') or ''
    usage = {
        'prompt_tokens': data.get('prompt_eval_count'),
        'completion_tokens': data.get('eval_count'),
    }
    return str(content), str(data.get('done_reason') or ''), str(reasoning), usage


async def _post(payload: dict[str, Any], timeout: float) -> tuple[dict[str, Any], int]:
    url = settings.chat_url
    async with httpx.AsyncClient(timeout=timeout, transport=TEST_TRANSPORT) as client:
        response = await client.post(url, json=payload, headers=_headers())
    if response.status_code >= 400:
        raise _map_http_error(response.status_code, response.text)
    try:
        return response.json(), response.status_code
    except ValueError as error:
        raise LLMError('bad_response', hint='上游返回的不是 JSON', detail=response.text[:400]) from error


async def complete(
    messages: list[dict[str, str]],
    *,
    purpose: str = 'chat',
    temperature: float = 0.6,
    max_tokens: int = 800,
    json_mode: bool = False,
    timeout: float | None = None,
) -> LLMResult:
    """真实调用大模型。失败时抛 LLMError，绝不返回伪造内容。"""
    if not settings.ai_enabled:
        raise LLMError('not_configured', hint=_hint_for('not_configured'))

    started = time.perf_counter()
    request_timeout = timeout or settings.openai_timeout
    logger.info(
        '[llm:%s] -> %s model=%s style=%s messages=%d json=%s max_tokens=%d timeout=%.1fs',
        purpose, settings.chat_url, settings.openai_model, settings.api_style,
        len(messages), json_mode, max_tokens, request_timeout,
    )

    attempts = 0
    with_response_format = json_mode
    budget = max_tokens
    try:
        while True:
            attempts += 1
            payload = _build_payload(
                messages,
                temperature=temperature,
                max_tokens=budget,
                json_mode=json_mode,
                with_response_format=with_response_format,
            )
            try:
                data, status = await _post(payload, request_timeout)
            except LLMError as error:
                # 部分网关不支持 response_format，降级重试一次
                if error.code == 'bad_request' and with_response_format and 'response_format' in error.detail:
                    logger.warning('[llm:%s] 上游不支持 response_format，去掉后重试', purpose)
                    with_response_format = False
                    continue
                raise
            elapsed = int((time.perf_counter() - started) * 1000)
            text, finish_reason, reasoning, usage = _parse_body(data)
            logger.info(
                '[llm:%s] <- HTTP %s %dms finish=%s content=%dch reasoning=%dch usage=%s',
                purpose, status, elapsed, finish_reason or '-', len(text), len(reasoning), usage,
            )
            if text.strip():
                return LLMResult(
                    text=text.strip(),
                    model=settings.openai_model,
                    style=settings.api_style,
                    request_url=settings.chat_url,
                    finish_reason=finish_reason,
                    elapsed_ms=elapsed,
                    usage=usage,
                    reasoning=reasoning,
                    attempts=attempts,
                )
            # 输出被思考过程吃掉了：只对"确实还有余量"的情况放大一次预算
            if finish_reason == 'length' and budget < 3000 and reasoning:
                budget = min(3000, budget * 3)
                logger.warning('[llm:%s] 正文为空（思考占满输出），把 max_tokens 提升到 %d 重试', purpose, budget)
                continue
            raise LLMError(
                'empty_content',
                hint=_hint_for('empty_content'),
                detail=('模型只返回了思考过程：' + reasoning[:200]) if reasoning else '模型返回了空内容',
            )
    except LLMError:
        raise
    except httpx.TimeoutException as error:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.warning('[llm:%s] 超时 %dms：%s', purpose, elapsed, error)
        raise LLMError('timeout', hint=_hint_for('timeout')) from error
    except httpx.HTTPError as error:
        elapsed = int((time.perf_counter() - started) * 1000)
        logger.warning('[llm:%s] 连接失败 %dms：%s: %s', purpose, elapsed, type(error).__name__, error)
        raise LLMError('connection', hint=_hint_for('connection'), detail=str(error)) from error
    except Exception as error:  # noqa: BLE001 - 兜底成明确的 500，而不是伪装成功
        logger.exception('[llm:%s] 未预期错误', purpose)
        raise LLMError('upstream_error', detail=str(error)) from error


def _loads_json(text: str) -> dict[str, Any]:
    try:
        parsed = json.loads(text)
    except ValueError:
        start, end = text.find('{'), text.rfind('}')
        if start >= 0 and end > start:
            try:
                parsed = json.loads(text[start:end + 1])
            except ValueError as error:
                raise LLMError('bad_response', detail=text[:300]) from error
        else:
            raise LLMError('bad_response', detail=text[:300])
    if not isinstance(parsed, dict):
        raise LLMError('bad_response', detail=text[:300])
    return parsed


async def chat_json_result(
    system_prompt: str,
    user_prompt: str,
    *,
    purpose: str = 'json',
    max_tokens: int = 900,
) -> JsonCall:
    """带原因的 JSON 调用：调用方可以据此在 UI 上标出真实失败原因。"""
    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user', 'content': user_prompt},
    ]
    try:
        result = await complete(messages, purpose=purpose, temperature=0.4, max_tokens=max_tokens, json_mode=True)
        return JsonCall(payload=_loads_json(result.text), result=result)
    except LLMError as error:
        return JsonCall(payload=None, error=error)


async def chat_json(system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
    """兼容旧调用：失败返回 None（调用方会明确标注 fallback）。"""
    call = await chat_json_result(system_prompt, user_prompt)
    return call.payload


async def extract_tags(prefs: dict[str, Any]) -> dict[str, Any]:
    groups = build_tag_groups(prefs)
    rule_result = {
        'groups': groups,
        'storyKeywords': groups[-1]['tags'],
        'summary': '已从你的填写内容里整理出 '
        + str(sum(len(group['tags']) for group in groups))
        + ' 个标签，其中音乐口味会直接影响匹配顺序。',
        'source': 'rules',
    }

    call = await chat_json_result(
        TAG_SYSTEM_PROMPT,
        json.dumps({'prefs': prefs}, ensure_ascii=False),
        purpose='tags',
    )
    if call.payload is None or not isinstance(call.payload.get('groups'), list):
        reason = call.error.code if call.error else 'bad_response'
        logger.warning('[llm:tags] 使用规则回退：%s', reason)
        return {**rule_result, 'fallbackReason': reason}
    if call.result is not None:
        logger.info('[llm:tags] 使用模型结果 %dms', call.result.elapsed_ms)
    call.payload['storyKeywords'] = rule_result['storyKeywords']
    call.payload['source'] = 'model'
    call.payload.setdefault('summary', rule_result['summary'])
    return call.payload


async def generate_icebreakers(concert: dict[str, Any], prefs: dict[str, Any], shared_songs: list[str]) -> list[str]:
    rule_result = build_icebreakers(concert, prefs, shared_songs)
    call = await chat_json_result(
        ICEBREAKER_SYSTEM_PROMPT,
        json.dumps(
            {
                'concert': concert.get('title'),
                'artist': concert.get('artist'),
                'sharedSongs': shared_songs,
                'purposes': prefs.get('purposes') or [],
            },
            ensure_ascii=False,
        ),
        purpose='icebreakers',
    )
    questions = (call.payload or {}).get('questions')
    if not payload_ok(questions):
        logger.warning('[llm:icebreakers] 使用规则回退：%s', call.error.code if call.error else 'bad_response')
        return rule_result
    return [str(item) for item in questions][:8]


def payload_ok(questions: Any) -> bool:
    return isinstance(questions, list) and bool(questions)


async def diagnose(prompt: str = '用一句中文确认你可以正常工作。') -> dict[str, Any]:
    """真实跑一次往返，返回配置与结果（或明确的错误），供自检脚本与 /api/ai/diagnose 使用。"""
    report: dict[str, Any] = {'config': settings.ai_status()}
    started = time.perf_counter()
    try:
        result = await complete(
            [
                {'role': 'system', 'content': '你是中文助手，回答不超过 30 字。'},
                {'role': 'user', 'content': prompt},
            ],
            purpose='diagnose',
            temperature=0.2,
            max_tokens=400,
            timeout=max(settings.openai_timeout, 60.0),
        )
        report['ok'] = True
        report['reply'] = result.text
        report['model'] = result.model
        report['finishReason'] = result.finish_reason
        report['usage'] = result.usage
        report['attempts'] = result.attempts
    except LLMError as error:
        report['ok'] = False
        report['error'] = error.to_dict()
    report['elapsedMs'] = int((time.perf_counter() - started) * 1000)
    return report

# 错误码 -> HTTP 状态码：让前端能区分"没配置 / Key 无效 / 超时 / 上游故障"
STATUS_BY_CODE = {
    'not_configured': 503,
    'auth_failed': 401,
    'model_not_found': 400,
    'bad_request': 400,
    'rate_limited': 429,
    'timeout': 504,
    'connection': 502,
    'upstream_error': 502,
    'bad_response': 502,
    'empty_content': 502,
}


def http_status_for_code(code: str) -> int:
    return STATUS_BY_CODE.get(code, 502)


def http_status_for(error: LLMError) -> int:
    return http_status_for_code(error.code)