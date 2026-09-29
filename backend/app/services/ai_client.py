'''OpenAI 兼容大模型接入（预留接口）。

设计原则：
1. 没有任何 API Key 或模型配置时，自动使用确定性规则回退，Demo 不受影响；
2. Key 只从后端环境变量读取，绝不下发给前端，也不会写入日志；
3. 任何调用失败都会回退到规则结果，不阻塞演示。
'''

import json
import logging
from typing import Any

import httpx

from app.config import settings
from app.content import build_icebreakers, build_tag_groups

logger = logging.getLogger('same_frequency.ai')

TAG_SYSTEM_PROMPT = (
    '你是音乐演出同行匹配助手。请把用户填写的偏好整理成结构化标签，'
    '只输出 JSON，不要输出解释。字段：groups（数组，元素包含 id/title/hint/tags），'
    'summary（一句话中文总结）。tags 必须是简短中文标签。'
)

ICEBREAKER_SYSTEM_PROMPT = (
    '你是演出现场的破冰助手。请基于共同歌曲生成 6 条中文破冰问题，'
    '每条不超过 40 字，语气自然、不提隐私问题。只输出 JSON：{questions: [...]}。'
)


async def chat_json(system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
    '''调用 OpenAI 兼容的 chat/completions 接口并解析 JSON；未配置或失败时返回 None。'''
    if not settings.ai_enabled:
        return None
    payload = {
        'model': settings.openai_model,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
        'temperature': 0.4,
        'response_format': {'type': 'json_object'},
    }
    headers = {
        'Authorization': 'Bearer ' + settings.openai_api_key,
        'Content-Type': 'application/json',
    }
    try:
        async with httpx.AsyncClient(timeout=settings.openai_timeout) as client:
            response = await client.post(settings.chat_completions_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        content = data['choices'][0]['message']['content']
        return json.loads(content)
    except Exception as error:  # noqa: BLE001 - 演示项目，任何异常都回退到规则结果
        logger.warning('大模型调用失败，使用规则回退：%s', type(error).__name__)
        return None


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

    ai_result = await chat_json(
        TAG_SYSTEM_PROMPT,
        json.dumps({'prefs': prefs}, ensure_ascii=False),
    )
    if not ai_result or not isinstance(ai_result.get('groups'), list):
        return rule_result

    ai_result['storyKeywords'] = rule_result['storyKeywords']
    ai_result['source'] = 'model'
    ai_result.setdefault('summary', rule_result['summary'])
    return ai_result


async def generate_icebreakers(concert: dict[str, Any], prefs: dict[str, Any], shared_songs: list[str]) -> list[str]:
    rule_result = build_icebreakers(concert, prefs, shared_songs)
    ai_result = await chat_json(
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
    )
    if not ai_result:
        return rule_result
    questions = ai_result.get('questions')
    if not isinstance(questions, list) or not questions:
        return rule_result
    return [str(item) for item in questions][:8]
