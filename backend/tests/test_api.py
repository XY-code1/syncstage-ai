'''后端接口冒烟测试（Demo 数据，不依赖任何外部服务）。

运行方式（在 backend 目录下）：
    python -m pytest tests -q
'''

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.routers import health as health_router

PREFS = {
    'likedSongs': ['夜航的信', '回声', '下午四点的海'],
    'likedArtists': ['星野回声'],
    'expectedTracks': ['夜航的信', '回声'],
    'story': '加班回家的路上一直在听这张专辑，想找个人一起排队，也想在副歌有人一起唱。',
    'purposes': ['副歌一起唱', '演出后聊音乐'],
    'chatStyle': '温和慢热',
    'groupSize': 3,
    'safety': ['只在公开场合见面', '不交换私人联系方式'],
    'myGender': 'prefer-not-to-say',
}


def test_health_reports_demo_mode(monkeypatch) -> None:
    # 显式构造"未配置模型"的状态，避免依赖本机 .env
    monkeypatch.setattr(health_router, 'settings', Settings(openai_model='', openai_api_key=''))
    with TestClient(app) as client:
        response = client.get('/api/health')
    assert response.status_code == 200
    payload = response.json()
    assert payload['status'] == 'ok'
    assert payload['demoData'] is True
    assert payload['aiEnabled'] is False  # 未配置模型时明确回退到规则
    assert 'Demo 演示数据' in payload['notice']


def test_concerts_and_detail() -> None:
    with TestClient(app) as client:
        listing = client.get('/api/concerts').json()
        detail = client.get('/api/concerts/night-flight')
        missing = client.get('/api/concerts/not-exist')

    assert len(listing['items']) == 3
    assert all(item['artistNote'] for item in listing['items'])
    assert detail.status_code == 200
    body = detail.json()
    assert body['title'] == '夜航计划'
    assert body['hotSongs'][0] == '夜航的信'
    assert 'meetingPoint' in body and 'name' in body['meetingPoint']
    assert missing.status_code == 404


def test_attendees_are_demo_users() -> None:
    with TestClient(app) as client:
        attendees = client.get('/api/concerts/night-flight/attendees').json()
    assert len(attendees) >= 6
    assert all(user['id'].startswith('u-') for user in attendees)
    assert all(user['likedSongs'] for user in attendees)


def test_matches_return_three_candidates_with_evidence() -> None:
    with TestClient(app) as client:
        response = client.post('/api/concerts/night-flight/matches', json={'prefs': PREFS, 'relax': False})
    assert response.status_code == 200
    payload = response.json()
    results = payload['results']
    assert payload['poolSize'] >= 6
    # 新引擎会先跑硬条件过滤，所以"返回人数 + 被排除人数 = 候选池"
    assert len(results) + payload['blockedCount'] == payload['poolSize']
    assert len(results) >= 3
    top_three = results[:3]
    assert len(top_three) == 3
    for item in top_three:
        assert 0 <= item['score'] <= 99
        assert len(item['evidence']) >= 2
        assert item['differences']
        assert item['matchReason']
        # 不能只返回总分：必须给出可核验的四维分解
        dimensions = item['scoreBreakdown']['dimensions']
        assert [dimension['id'] for dimension in dimensions] == ['music', 'expected', 'social', 'style_safety']
        assert sum(dimension['weight'] for dimension in dimensions) == 100
    assert top_three[0]['score'] >= 70
    assert top_three[0]['score'] >= top_three[2]['score']


def test_matches_respect_safety_gender_filter() -> None:
    prefs = dict(PREFS)
    prefs['safety'] = ['只在公开场合见面', '希望同行者性别相同']
    prefs['myGender'] = 'female'
    with TestClient(app) as client:
        payload = client.post('/api/concerts/night-flight/matches', json={'prefs': prefs}).json()
    assert payload['blockedCount'] > 0


def test_ai_tags_fall_back_to_rules() -> None:
    with TestClient(app) as client:
        payload = client.post('/api/ai/tags', json=PREFS).json()
    groups = {group['id']: group for group in payload['groups']}
    assert 'music' in groups and groups['music']['tags']
    assert payload['source'] == 'rules'
    assert payload['summary']


def test_icebreakers_and_memory_card() -> None:
    with TestClient(app) as client:
        icebreakers = client.post(
            '/api/concerts/night-flight/icebreakers',
            json={'prefs': PREFS, 'sharedSongs': ['夜航的信', '回声'], 'partnerId': 'u-01'},
        ).json()
        memory = client.post(
            '/api/concerts/night-flight/memory-card',
            json={'prefs': PREFS, 'sharedSongs': ['夜航的信', '回声'], 'partnerId': 'u-01', 'companionIds': ['u-04']},
        ).json()

    assert len(icebreakers['questions']) >= 6
    assert any('夜航的信' in question for question in icebreakers['questions'])
    assert memory['concertTitle'] == '夜航计划'
    assert memory['sharedSongs'] == ['夜航的信', '回声']
    assert len(memory['members']) == 3
    assert memory['line']


def test_invite_and_report_are_recorded() -> None:
    with TestClient(app) as client:
        invite = client.post('/api/invites', json={'toUserId': 'u-01', 'concertId': 'night-flight'})
        report = client.post('/api/reports', json={'reason': '对方反复索要私人联系方式', 'targetUserId': 'u-04'})
    assert invite.status_code == 200
    assert invite.json()['status'] == 'pending'
    assert report.json()['status'] == 'pending'
