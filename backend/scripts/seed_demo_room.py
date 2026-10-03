'''仅开发 / 演示用：为双身份人工演示准备一个固定的同行房间。

- 复用既有 rooms / room_messages 表与 db 层函数，不新增房间模型、不改业务逻辑；
- 房间固定为 ROOM_ID，两个浏览器凭同一 roomId 进入；
- 成员就是两个 Demo 身份（Demo访客 / 写歌的江离）且都已确认，因此输入框可用；
- 每次执行会清空该房间的历史消息并刷新创建时间，保证演示从干净状态开始。

用法（backend 目录下）：.venv\\Scripts\\python.exe scripts/seed_demo_room.py
'''

from __future__ import annotations

import sys
from datetime import datetime, timezone

from app.content import build_icebreakers, build_room_tasks
from app.db import create_room, get_concert, get_connection, init_db

ROOM_ID = 'room-demo-dual'
CONCERT_ID = 'night-flight'

# 与前端 DEMO_ROLES 保持一致（仅用于演示，不代表真实线上用户）
DEMO_MEMBERS = [
    {
        'userId': 'demo-visitor',
        'nickname': 'Demo访客',
        'avatar': {'from': '#31f58a', 'to': '#0b1116'},
        'isMe': True,
        'role': 'me',
        'confirmed': True,
        'chatStyle': '温和慢热',
        'note': 'Demo 测试身份（浏览器 A / 普通窗口）',
    },
    {
        'userId': 'jiangli',
        'nickname': '写歌的江离',
        'avatar': {'from': '#4a7dff', 'to': '#171a22'},
        'isMe': False,
        'role': 'partner',
        'confirmed': True,
        'chatStyle': '温和慢热',
        'note': 'Demo 测试身份（浏览器 B / 无痕窗口）',
    },
]


def main() -> int:
    init_db()
    concert = get_concert(CONCERT_ID)
    if concert is None:
        print('找不到 Demo 演出：' + CONCERT_ID)
        return 1

    meeting_point = dict(concert.get('meeting_point') or {})
    concert_payload = {
        'title': concert.get('title', ''),
        'artist': concert.get('artist', ''),
        'hot_songs': list(concert.get('hot_songs') or []),
        'meeting_point': meeting_point,
    }
    shared_songs = [song for song in (concert.get('hot_songs') or []) if song == '北京昨夜下了雪'][:1]
    payload = {
        'roomId': ROOM_ID,
        'concertId': CONCERT_ID,
        'concertTitle': concert.get('title', ''),
        'meetingPoint': meeting_point,
        'members': DEMO_MEMBERS,
        'icebreakers': build_icebreakers(concert_payload, {'purposes': ['找同场同行者']}, shared_songs),
        'tasks': build_room_tasks(concert_payload),
        'sharedSongs': shared_songs,
        'source': 'Demo 双身份人工演示房间（dev only）',
        'isDemo': True,
    }

    saved = create_room(ROOM_ID, CONCERT_ID, payload)
    with get_connection() as connection:
        connection.execute('DELETE FROM room_messages WHERE room_id = ?', (ROOM_ID,))

    print('已准备演示房间：' + saved['roomId'])
    print('成员：' + '、'.join(member['nickname'] + '(' + member['userId'] + ')' for member in DEMO_MEMBERS))
    print('创建时间：' + str(saved.get('createdAt') or datetime.now(timezone.utc).isoformat()))
    print('浏览器 A（普通窗口）：http://127.0.0.1:5173/#/room/' + ROOM_ID + '?demoRole=visitor')
    print('浏览器 B（无痕窗口）：http://127.0.0.1:5173/#/room/' + ROOM_ID + '?demoRole=jiangli')
    return 0


if __name__ == '__main__':
    sys.exit(main())

