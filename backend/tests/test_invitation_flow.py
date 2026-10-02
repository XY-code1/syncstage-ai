"""双向确认状态机：只有 accepted 才创建唯一房间，其余状态一律不建房、不进房。

覆盖用户验收清单：
1. A 邀请、B 未确认 → A 不能进房；
2. B 接受 → 双方进入同一 roomId；
3. B 拒绝 → 双方都不能进房；
4. B 超时 → 旧邀请失效；
5. A 撤回后 B 再接受 → 失败且不建房；
6. 双方几乎同时操作 → 只创建一个房间；
7. 刷新后 waiting / accepted / declined 状态正确恢复；
8. 直接访问房间路由由前端拦截（见 frontend/scripts/e2e-smoke.mjs）。
"""

from __future__ import annotations

import threading
import time

from fastapi.testclient import TestClient

from app.agent import orchestrator as orch_module
from app.main import app

INTENT = '想找个安静一点的女生一起候场，最好同龄，一起把《夜航的信》的副歌唱完，散场后各自回家。'
SCOPES = ['favorite_songs', 'top_artists', 'recent_plays', 'followed_events', 'playlist_tags']


def _start(client: TestClient) -> dict:
    response = client.post(
        '/api/agent/sessions',
        json={'eventId': 'night-flight', 'userId': 'u-viewer', 'text': INTENT, 'authorizedScopes': SCOPES, 'demoCase': 'normal'},
    )
    assert response.status_code == 200, response.text
    return response.json()


def _invite(client: TestClient, state: dict) -> tuple[str, str, str]:
    """发起邀请，并返回 (sessionId, 候选人 userId, inviteId)。

    编排器是进程内单例，多个测试会累积「等待确认」的会话；
    因此这里按 inviteId 精确取出本次邀请，而不是断言总数。
    """

    session_id = state['sessionId']
    partner = state['rankedCandidates'][0]['userId']
    invited = client.post(f'/api/agent/sessions/{session_id}/invite', json={'candidateId': partner})
    assert invited.status_code == 200, invited.text
    body = invited.json()
    assert body['pendingConfirmation']['status'] == 'awaiting_peer'
    invite_id = body['pendingConfirmation']['inviteId']
    assert invite_id
    return session_id, partner, invite_id


def _listed(client: TestClient, user_id: str) -> list[dict]:
    response = client.get('/api/agent/invitations', params={'userId': user_id})
    assert response.status_code == 200, response.text
    return response.json()['invitations']


def _find(items: list[dict], invite_id: str) -> dict | None:
    return next((item for item in items if item.get('inviteId') == invite_id), None)


def test_candidate_state_waits_for_explicit_invite() -> None:
    with TestClient(app) as client:
        state = _start(client)
        pending = state['pendingConfirmation']
        assert pending['status'] == 'candidate'
        assert pending['proposerConfirmed'] is False and pending['peerConfirmed'] is False
        assert pending['inviteId'] is None
        # candidate 阶段还没选定邀请对象，避免前端把「还没邀请」误判成「已邀请」。
        assert pending['candidateId'] is None
        assert state['roomId'] is None
        assert client.post('/api/agent/sessions/' + state['sessionId'] + '/room').status_code == 409


def test_invitation_view_exposes_activity_song_meeting_point() -> None:
    with TestClient(app) as client:
        state = _start(client)
        _, partner, invite_id = _invite(client, state)
        invite = _find(_listed(client, partner), invite_id)
        assert invite is not None
        assert invite['toUserId'] == partner
        assert invite['fromName'] and invite['fromName'] != '你'
        assert invite['concertTitle']
        assert invite['sharedSongs'] and invite['matchReason']
        assert invite['meetingPoint'] and invite['safety']
        assert invite['expiresAt'] and invite['expiresAt'] > invite['createdAt']


def test_peer_accept_creates_one_shared_room_and_survives_reload() -> None:
    with TestClient(app) as client:
        state = _start(client)
        session_id, partner, invite_id = _invite(client, state)

        # 单方确认绝不放开房间。
        assert client.post(f'/api/agent/sessions/{session_id}/room').status_code == 409

        accepted = client.post(f'/api/agent/invitations/{invite_id}/respond', json={'accept': True})
        assert accepted.status_code == 200, accepted.text
        body = accepted.json()
        assert body['pendingConfirmation']['status'] == 'accepted'
        room_id = body['roomId']
        assert room_id

        # 刷新后状态与房间都恢复。
        reloaded = client.get(f'/api/agent/sessions/{session_id}').json()
        assert reloaded['pendingConfirmation']['status'] == 'accepted'
        assert reloaded['roomId'] == room_id
        room = client.get('/api/rooms/' + room_id)
        assert room.status_code == 200
        member_ids = {member['userId'] for member in room.json()['members']}
        assert 'u-viewer' in member_ids and len(member_ids) >= 2

        # 幂等：重复建房只返回同一个房间。
        assert client.post(f'/api/agent/sessions/{session_id}/room').json()['roomId'] == room_id
        # 已确认的邀请不再出现在对方待确认列表里。
        assert _find(_listed(client, partner), invite_id) is None


def test_peer_decline_creates_no_room() -> None:
    with TestClient(app) as client:
        state = _start(client)
        session_id, partner, invite_id = _invite(client, state)

        declined = client.post(f'/api/agent/invitations/{invite_id}/respond', json={'accept': False})
        assert declined.status_code == 200, declined.text
        assert declined.json()['pendingConfirmation']['status'] == 'declined'
        assert declined.json()['roomId'] is None
        assert client.post(f'/api/agent/sessions/{session_id}/room').status_code == 409
        assert client.get('/api/agent/sessions/' + session_id).json()['pendingConfirmation']['status'] == 'declined'
        assert _find(_listed(client, partner), invite_id) is None


def test_cancelled_invitation_rejects_late_accept() -> None:
    with TestClient(app) as client:
        state = _start(client)
        session_id, partner, invite_id = _invite(client, state)

        cancelled = client.post(f'/api/agent/sessions/{session_id}/cancel-invite')
        assert cancelled.status_code == 200
        assert cancelled.json()['pendingConfirmation']['status'] == 'cancelled'
        assert cancelled.json()['roomId'] is None

        late = client.post(f'/api/agent/invitations/{invite_id}/respond', json={'accept': True})
        assert late.status_code == 409, late.text
        assert client.post(f'/api/agent/sessions/{session_id}/room').status_code == 409
        assert _find(_listed(client, partner), invite_id) is None


def test_expired_invitation_is_invalid(monkeypatch) -> None:
    with TestClient(app) as client:
        monkeypatch.setattr(orch_module, 'invite_ttl_ms', lambda: 1000)
        state = _start(client)
        session_id, partner, invite_id = _invite(client, state)

        time.sleep(1.2)
        # 对方视角已经看不到这条邀请，状态惰性变为 expired。
        assert _find(_listed(client, partner), invite_id) is None
        assert client.get('/api/agent/sessions/' + session_id).json()['pendingConfirmation']['status'] == 'expired'
        assert client.post(f'/api/agent/invitations/{invite_id}/respond', json={'accept': True}).status_code == 409
        assert client.post(f'/api/agent/sessions/{session_id}/room').status_code == 409


def test_simultaneous_accept_only_creates_one_room() -> None:
    with TestClient(app) as client:
        state = _start(client)
        session_id, _, invite_id = _invite(client, state)

        results: list = []

        def respond() -> None:
            results.append(client.post(f'/api/agent/invitations/{invite_id}/respond', json={'accept': True}))

        threads = [threading.Thread(target=respond) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        statuses = sorted(item.status_code for item in results)
        assert all(code in (200, 409) for code in statuses), statuses
        winners = [item.json() for item in results if item.status_code == 200]
        assert winners, statuses
        room_ids = {item['roomId'] for item in winners}
        assert len(room_ids) == 1 and next(iter(room_ids))
        # 落库的会话只指向这一个房间。
        assert client.get(f'/api/agent/sessions/{session_id}').json()['roomId'] == next(iter(room_ids))


def test_accepted_invitation_cannot_be_cancelled() -> None:
    with TestClient(app) as client:
        state = _start(client)
        session_id, _, invite_id = _invite(client, state)
        accepted = client.post(f'/api/agent/invitations/{invite_id}/respond', json={'accept': True})
        assert accepted.status_code == 200

        cancelled = client.post(f'/api/agent/sessions/{session_id}/cancel-invite')
        assert cancelled.status_code == 409, cancelled.text
        still = client.get(f'/api/agent/sessions/{session_id}').json()
        assert still['pendingConfirmation']['status'] == 'accepted'
        assert still['roomId'] == accepted.json()['roomId']


def test_unknown_invite_cannot_respond() -> None:
    with TestClient(app) as client:
        response = client.post('/api/agent/invitations/inv-does-not-exist/respond', json={'accept': True})
        assert response.status_code == 404


def test_demo_alias_maps_nickname_to_real_candidate() -> None:
    with TestClient(app) as client:
        state = _start(client)
        session_id, _, invite_id = _invite(client, state)
        nickname = client.get(f'/api/agent/sessions/{session_id}').json()['rankedCandidates'][0]['candidate']['nickname']

        response = client.get('/api/agent/invitations', params={'userId': 'jiangli', 'nickname': nickname})
        assert response.status_code == 200
        matched = _find(response.json()['invitations'], invite_id)
        assert matched is not None
        assert matched['toNickname'] == nickname
        assert _find(_listed(client, 'jiangli'), invite_id) is None  # 不带昵称时不匹配演示替身
        assert _find(client.get('/api/agent/invitations', params={'userId': 'jiangli', 'nickname': '查无此人'}).json()['invitations'], invite_id) is None