"""Agent 冒烟测试：验收标准里的 Agent 相关条目都要在这里被真实断言。

运行：python -m pytest tests -q
"""

from __future__ import annotations

import re

import pytest
from fastapi.testclient import TestClient

from app.agent.tools import TOOLS
from app.integrations.base import TMEDataUnavailable, get_tme_provider
from app.main import app

NORMAL_INTENT = '想找个安静一点的女生一起候场，最好同龄，一起把《夜航的信》的副歌唱完，散场后各自回家。'

REQUIRED_TOOLS = {
    'get_authorized_music_profile',
    'get_event_context',
    'parse_social_intent',
    'search_same_event_candidates',
    'apply_safety_constraints',
    'rank_candidates',
    'build_group',
    'generate_grounded_reason',
    'send_mutual_consent_invitation',
    'create_temporary_room',
    'collect_feedback',
    'verify_same_event', 'compare_arrival_plan', 'compare_music_profile', 'compare_social_intent',
    'negotiate_group_size', 'verify_safety_constraints', 'identify_conflicts', 'generate_handshake_report',
}

QUOTE_PATTERN = re.compile(r'《([^》]+)》|「([^」]+)」')


def _start(client: TestClient, **overrides) -> dict:
    payload = {
        'eventId': 'night-flight',
        'userId': 'u-viewer',
        'text': NORMAL_INTENT,
        'authorizedScopes': ['favorite_songs', 'top_artists', 'recent_plays', 'followed_events', 'playlist_tags'],
        'demoCase': 'normal',
    }
    payload.update(overrides)
    response = client.post('/api/agent/sessions', json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def test_tool_registry_contains_all_required_tools() -> None:
    assert REQUIRED_TOOLS.issubset(set(TOOLS))
    assert all(spec.description and spec.label for spec in TOOLS.values())


def test_agent_calls_at_least_five_tools_for_real() -> None:
    with TestClient(app) as client:
        state = _start(client)

    called = [item['name'] for item in state['trace']]
    assert len(called) >= 5, '应该真实调用至少 5 个工具'
    assert len(set(called)) == len(set(called))
    assert set(called) >= {
        'parse_social_intent',
        'get_authorized_music_profile',
        'get_event_context',
        'search_same_event_candidates',
        'apply_safety_constraints',
        'rank_candidates',
    }
    for item in state['trace']:
        assert item['durationMs'] >= 0
        assert item['inputSummary']
        assert item['outputSummary']


def test_agent_trace_is_grouped_into_six_visible_phases() -> None:
    with TestClient(app) as client:
        state = _start(client)
    phases = state['phases']
    assert [phase['id'] for phase in phases] == [
        'understand',
        'profile',
        'search',
        'safety',
        'rank',
        'plan',
    ]
    assert all(phase['state'] == 'done' for phase in phases)


def test_results_carry_score_breakdown_and_evidence() -> None:
    with TestClient(app) as client:
        state = _start(client)

    assert state['status'] == 'pending_confirmation'
    ranked = state['rankedCandidates']
    assert ranked

    for item in ranked:
        breakdown = item['scoreBreakdown']
        dimensions = breakdown['dimensions']
        assert [dimension['id'] for dimension in dimensions] == ['music', 'expected', 'social', 'style_safety']
        assert sum(dimension['weight'] for dimension in dimensions) == 100
        for dimension in dimensions:
            assert 0.0 <= dimension['ratio'] <= 1.0
            assert dimension['points'] == pytest.approx(round(dimension['weight'] * dimension['ratio'], 1), abs=0.001)
        assert 0 <= item['score'] <= 99
        assert item['evidence'], '每位候选人都必须有证据'

    scores = [item['score'] for item in ranked]
    assert scores == sorted(scores, reverse=True)


def test_match_reason_only_cites_existing_evidence() -> None:
    with TestClient(app) as client:
        state = _start(client)

    checked = 0
    for item in state['rankedCandidates']:
        reason = item['matchReason']
        if not reason:
            continue
        checked += 1
        allowed = set()
        for entry in item['evidence']:
            allowed.update(entry['items'])
            allowed.add(entry['text'])
        for first, second in QUOTE_PATTERN.findall(reason):
            token = first or second
            assert token in allowed, '推荐理由引用了证据里不存在的「' + token + '」'
    assert checked > 0, '至少要有一位候选人给出推荐理由'


def test_safety_filtered_case_returns_no_match_without_fabricating_candidates() -> None:
    with TestClient(app) as client:
        state = _start(client, demoCase='safety_no_match', text='严格一点，只找同岁、同性、两个人一起的。')

    assert state['status'] == 'no_match'
    assert state['rankedCandidates'] == []
    assert state['proposedGroup'] == {}
    assert state['excludedCandidates'], '必须说明是谁被哪条规则排除了'
    assert state['pendingConfirmation']['status'] == 'blocked'
    rules = {item['rule'] for item in state['excludedCandidates']}
    assert rules & {'性别偏好不兼容', '年龄段不兼容', '组队人数不兼容'}


def test_ai_fallback_case_still_completes_matching() -> None:
    with TestClient(app) as client:
        state = _start(client, demoCase='ai_fallback')

    assert state['status'] == 'pending_confirmation'
    assert state['rankedCandidates']
    parse_step = next(item for item in state['trace'] if item['name'] == 'parse_social_intent')
    assert parse_step['usedFallback'] is True
    assert '规则解析' in parse_step['outputSummary']


def test_room_requires_mutual_confirmation() -> None:
    with TestClient(app) as client:
        state = _start(client)
        session_id = state['sessionId']
        assert state['rankedCandidates']
        partner_id = state['rankedCandidates'][0]['userId']

        blocked = client.post('/api/agent/sessions/' + session_id + '/room')
        assert blocked.status_code == 409

        invited = client.post('/api/agent/sessions/' + session_id + '/invite', json={'candidateId': partner_id})
        assert invited.status_code == 200
        assert invited.json()['pendingConfirmation']['status'] == 'awaiting_peer'

        still_blocked = client.post('/api/agent/sessions/' + session_id + '/room')
        assert still_blocked.status_code == 409

        peer = client.post('/api/agent/sessions/' + session_id + '/peer-confirm', json={'accept': True})
        assert peer.json()['pendingConfirmation']['status'] == 'both_confirmed'

        created = client.post('/api/agent/sessions/' + session_id + '/room')
        assert created.status_code == 200
        body = created.json()
        assert body['roomId']
        assert body['status'] == 'room_created'
        room_step = [item for item in body['trace'] if item['name'] == 'create_temporary_room'][-1]
        assert '公开集合点' in room_step['outputSummary']


def test_a2a_exchange_is_structured_and_contains_no_sensitive_fields() -> None:
    with TestClient(app) as client:
        state = _start(client, authorizedScopes=['favorite_songs'])
    report = next(iter(state['handshakeReports'].values()))
    assert set(report['exchangedFields']) == {'eventId', 'arrivalWindow', 'musicTags', 'socialIntent', 'groupSize', 'safetyConstraints'}
    serialized = str(report['exchangedFields'])
    assert all(value not in serialized for value in ('realName', 'phone', 'contact', 'exactLocation', 'rawListeningHistory'))
    assert state['musicProfile']['recentTitles'] == []
    assert state['musicProfile']['topArtists'] == []


def test_differences_require_human_confirmation_and_destroy_revokes_data() -> None:
    with TestClient(app) as client:
        state = _start(client)
        reports = state['handshakeReports'].values()
        assert all(report['needsHumanConfirmation'] for report in reports)
        session_id = state['sessionId']
        assert client.post(f'/api/agent/sessions/{session_id}/destroy').json()['destroyed'] is True
        assert client.get(f'/api/agent/sessions/{session_id}').status_code == 404


def test_intent_parse_endpoint_returns_structured_intent() -> None:
    with TestClient(app) as client:
        payload = client.post(
            '/api/agent/intent/parse',
            json={'text': '想组一个三人小组一起排队，副歌一起唱，只在公开场合见面。', 'eventId': 'night-flight'},
        ).json()

    intent = payload['parsedIntent']
    assert '一起排队候场' in intent['purposes']
    assert '副歌一起唱' in intent['purposes']
    assert '只在公开场合见面' in intent['safety']
    assert intent['groupSize'] == 3
    assert payload['usedFallback'] is True


def test_feedback_is_recorded() -> None:
    with TestClient(app) as client:
        state = _start(client)
        response = client.post(
            '/api/agent/sessions/' + state['sessionId'] + '/feedback',
            json={'rating': 'good', 'tags': ['理由可信'], 'comment': '演示用'},
        )
    assert response.status_code == 200
    step = [item for item in response.json()['trace'] if item['name'] == 'collect_feedback'][-1]
    assert step['status'] == 'ok'


def test_provider_endpoint_states_mock_data_and_official_api_limit() -> None:
    with TestClient(app) as client:
        payload = client.get('/api/agent/provider').json()
    assert payload['provider'] == 'mock_qqmusic'
    assert payload['isDemo'] is True
    assert '暂未提供 TME 官方 API' in payload['disclaimer']
    assert set(payload['scopes']) == {
        'favorite_songs',
        'top_artists',
        'recent_plays',
        'followed_events',
        'playlist_tags',
    }


def test_mock_provider_interface_and_authorization_scopes() -> None:
    provider = get_tme_provider('mock')

    profile = provider.get_user_music_profile('u-01')
    assert profile is not None
    assert profile.favorite_tracks and profile.top_artists and profile.playlist_tags
    assert profile.followed_event_ids
    assert profile.is_demo is True

    limited = provider.get_user_music_profile('u-01', scopes=['favorite_songs'])
    assert limited is not None
    assert limited.favorite_tracks
    assert limited.recent_plays == ()
    assert limited.playlist_tags == ()
    assert limited.authorized_scopes == ('favorite_songs',)

    event = provider.get_event_context('night-flight')
    assert event is not None
    assert event.attendee_user_ids
    assert event.meeting_point['name']

    tracks = provider.get_track_metadata([track.track_id for track in profile.favorite_tracks])
    assert len(tracks) == len(profile.favorite_tracks)
    assert provider.get_track_metadata(['trk-not-exist']) == []

    assert provider.search_tracks('夜航的信')
    assert provider.get_user_music_profile('u-not-exist') is None
    assert provider.get_event_context('not-exist') is None


def test_official_provider_is_not_faked() -> None:
    provider = get_tme_provider('official')
    assert provider.name == 'official_tme'
    with pytest.raises(TMEDataUnavailable) as error:
        provider.get_user_music_profile('u-01')
    assert error.value.reason == 'not_implemented'
    assert provider.describe()['implemented'] is False
