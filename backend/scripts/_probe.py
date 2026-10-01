import json, sys, time
import httpx
sys.stdout.reconfigure(encoding='utf-8')

BASE = 'http://127.0.0.1:11434'
MODEL = 'qwen3.5:0.8b'
MSG = [
    {'role': 'system', 'content': 'You are a helpful assistant. Answer in Chinese, max 20 chars.'},
    {'role': 'user', 'content': 'Say one short Chinese sentence to confirm you work.'},
]

def show(label, url, payload, headers=None):
    started = time.perf_counter()
    try:
        with httpx.Client(timeout=180) as client:
            r = client.post(url, json=payload, headers=headers or {})
        ms = (time.perf_counter() - started) * 1000
        print('--- %s -> HTTP %s %.0fms' % (label, r.status_code, ms))
        if r.status_code >= 400:
            print('   ', r.text[:300]); return
        data = r.json()
        if 'choices' in data:
            msg = data['choices'][0].get('message') or {}
            print('    finish:', data['choices'][0].get('finish_reason'))
            print('    content:', repr((msg.get('content') or '')[:160]))
            print('    reasoning:', repr((msg.get('reasoning') or '')[:60]))
        else:
            print('    content:', repr((data.get('message') or {}).get('content', '')[:160]))
            print('    thinking:', repr((data.get('message') or {}).get('thinking', '')[:60]))
            print('    done_reason:', data.get('done_reason'), 'keys:', list(data.keys()))
    except Exception as e:
        print('--- %s -> FAILED %s: %s' % (label, type(e).__name__, e))

show('native think=false', BASE + '/api/chat', {'model': MODEL, 'messages': MSG, 'stream': False, 'think': False, 'options': {'num_predict': 512}})
show('native default', BASE + '/api/chat', {'model': MODEL, 'messages': MSG, 'stream': False, 'options': {'num_predict': 512}})
show('openai chat_template_kwargs', BASE + '/v1/chat/completions', {'model': MODEL, 'messages': MSG, 'max_tokens': 512, 'chat_template_kwargs': {'enable_thinking': False}})
show('openai max_tokens=2048', BASE + '/v1/chat/completions', {'model': MODEL, 'messages': MSG, 'max_tokens': 2048})