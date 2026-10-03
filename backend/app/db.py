'''SQLite 访问层：Phase 2 用最小实现保存演出、观众、邀请与举报记录。'''

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from app.config import settings
from app.demo_data import DEMO_CONCERTS, DEMO_USERS

SCHEMA = '''
CREATE TABLE IF NOT EXISTS concerts (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS user_concerts (
    user_id TEXT NOT NULL,
    concert_id TEXT NOT NULL,
    PRIMARY KEY (user_id, concert_id)
);

CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user TEXT NOT NULL,
    to_user TEXT NOT NULL,
    concert_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rooms (
    room_id TEXT PRIMARY KEY,
    concert_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    rating TEXT,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_user_id TEXT,
    concert_id TEXT,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    sender_name TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
'''


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    path = settings.db_path
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def init_db() -> None:
    '''建表并同步仓库内的 Demo 基础数据。'''
    with get_connection() as connection:
        connection.executescript(SCHEMA)
        # Demo 曲库会随源码迭代；启动时幂等刷新演出/用户 fixture，
        # 但不触碰邀请、房间、聊天等运行状态。
        seed_demo_data(connection)


def seed_demo_data(connection: sqlite3.Connection) -> None:
    for concert in DEMO_CONCERTS:
        connection.execute(
            'INSERT OR REPLACE INTO concerts (id, payload, is_demo) VALUES (?, ?, 1)',
            (concert['id'], json.dumps(concert, ensure_ascii=False)),
        )
    for user in DEMO_USERS:
        connection.execute(
            'INSERT OR REPLACE INTO users (id, payload, is_demo) VALUES (?, ?, 1)',
            (user['id'], json.dumps(user, ensure_ascii=False)),
        )
        for concert_id in user['concert_ids']:
            connection.execute(
                'INSERT OR REPLACE INTO user_concerts (user_id, concert_id) VALUES (?, ?)',
                (user['id'], concert_id),
            )


def _load_payloads(rows: list[sqlite3.Row]) -> list[dict[str, Any]]:
    return [json.loads(row['payload']) for row in rows]


def list_concerts() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute('SELECT payload FROM concerts ORDER BY id').fetchall()
    return _load_payloads(rows)


def get_concert(concert_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute('SELECT payload FROM concerts WHERE id = ?', (concert_id,)).fetchone()
    return json.loads(row['payload']) if row else None


def get_user(user_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute('SELECT payload FROM users WHERE id = ?', (user_id,)).fetchone()
    return json.loads(row['payload']) if row else None


def list_attendees(concert_id: str) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            'SELECT users.payload AS payload FROM user_concerts '
            'JOIN users ON users.id = user_concerts.user_id '
            'WHERE user_concerts.concert_id = ? ORDER BY users.id',
            (concert_id,),
        ).fetchall()
    return _load_payloads(rows)


def create_invite(concert_id: str, from_user: str, to_user: str) -> dict[str, Any]:
    now = _now()
    with get_connection() as connection:
        cursor = connection.execute(
            'INSERT INTO invites (from_user, to_user, concert_id, status, created_at, updated_at) '
            'VALUES (?, ?, ?, ?, ?, ?)',
            (from_user, to_user, concert_id, 'pending', now, now),
        )
        invite_id = cursor.lastrowid
    return {'id': invite_id, 'concertId': concert_id, 'toUserId': to_user, 'status': 'pending'}


def create_report(reason: str, target_user_id: str | None, concert_id: str | None) -> dict[str, Any]:
    with get_connection() as connection:
        cursor = connection.execute(
            'INSERT INTO reports (target_user_id, concert_id, reason, status, created_at) '
            'VALUES (?, ?, ?, ?, ?)',
            (target_user_id, concert_id, reason, 'pending', _now()),
        )
        report_id = cursor.lastrowid
    return {'id': report_id, 'status': 'pending'}

# ---------------------------------------------------------------------------
# 临时同频房间（只有双方确认后才会创建）
# ---------------------------------------------------------------------------


def create_room(
    room_id: str,
    concert_id: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    now = _now()
    with get_connection() as connection:
        connection.execute(
            'INSERT OR IGNORE INTO rooms (room_id, concert_id, payload, status, created_at) VALUES (?, ?, ?, ?, ?)',
            (room_id, concert_id, json.dumps(payload, ensure_ascii=False), 'active', now),
        )
        row = connection.execute('SELECT payload, created_at FROM rooms WHERE room_id = ?', (room_id,)).fetchone()
    saved = json.loads(row['payload']) if row else payload
    return {**saved, 'roomId': room_id, 'status': 'active', 'createdAt': row['created_at'] if row else now}


def get_room(room_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute('SELECT payload, created_at FROM rooms WHERE room_id = ?', (room_id,)).fetchone()
    if row is None:
        return None
    payload = json.loads(row['payload'])
    payload['roomId'] = room_id
    payload.setdefault('createdAt', row['created_at'])
    return payload


def create_feedback(session_id: str, rating: str, payload: dict[str, Any]) -> dict[str, Any]:
    with get_connection() as connection:
        cursor = connection.execute(
            'INSERT INTO feedback (session_id, rating, payload, created_at) VALUES (?, ?, ?, ?)',
            (session_id, rating, json.dumps(payload, ensure_ascii=False), _now()),
        )
        feedback_id = cursor.lastrowid
    return {'id': feedback_id, 'sessionId': session_id, 'rating': rating, 'status': 'recorded'}


# ---------------------------------------------------------------------------
# 同行房间的真实双人消息（后端持久化；前端 2 秒轮询增量拉取）
# ---------------------------------------------------------------------------


def append_room_message(room_id: str, sender_id: str, sender_name: str, content: str) -> dict[str, Any]:
    '''写入一条真人消息；只落库，不触发任何模型或模拟回复。'''

    now = _now()
    with get_connection() as connection:
        cursor = connection.execute(
            'INSERT INTO room_messages (room_id, sender_id, sender_name, content, created_at) '
            'VALUES (?, ?, ?, ?, ?)',
            (room_id, sender_id, sender_name, content, now),
        )
        message_id = cursor.lastrowid
    return {
        'id': message_id,
        'roomId': room_id,
        'senderId': sender_id,
        'senderName': sender_name,
        'content': content,
        'createdAt': now,
    }


def list_room_messages(room_id: str, after: int | None = None) -> list[dict[str, Any]]:
    '''按 id 升序返回消息；after 用于轮询时只取增量。'''

    query = (
        'SELECT id, room_id, sender_id, sender_name, content, created_at '
        'FROM room_messages WHERE room_id = ?'
    )
    params: list[Any] = [room_id]
    if after is not None:
        query += ' AND id > ?'
        params.append(after)
    query += ' ORDER BY id'
    with get_connection() as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        {
            'id': row['id'],
            'roomId': row['room_id'],
            'senderId': row['sender_id'],
            'senderName': row['sender_name'],
            'content': row['content'],
            'createdAt': row['created_at'],
        }
        for row in rows
    ]
