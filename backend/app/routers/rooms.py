'''临时同行房间的双人消息接口（后端持久化；前端用 2 秒轮询拉增量）。

设计约束：
- 只读写真实消息，绝不触发大模型，也绝不替真人自动回复；
- 两个浏览器上下文凭同一个 roomId 进入，消息存在 SQLite，刷新不丢；
- 房间与成员沿用 Agent 双向确认后创建的 rooms 记录，不新建一套房间模型。
'''

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.db import append_room_message, get_room, list_room_messages

router = APIRouter(prefix='/api/rooms', tags=['rooms'])

MAX_CONTENT_LENGTH = 500

# Demo 双身份：人工演示时用固定身份互发消息，避免为了演示去改房间成员数据。
DEMO_IDENTITIES = {'demo-visitor', 'jiangli'}


class RoomMessageRequest(BaseModel):
    senderId: str = Field(min_length=1, max_length=64)
    senderName: str = Field(min_length=1, max_length=64)
    content: str = Field(min_length=1, max_length=MAX_CONTENT_LENGTH)


def _require_room(room_id: str) -> dict:
    room = get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail='这个临时房间不存在或已过期')
    return room


@router.get('/{room_id}')
def read_room(room_id: str) -> dict:
    '''第二个浏览器上下文凭 roomId 读取房间，不依赖任何本地存储。'''

    return _require_room(room_id)


@router.get('/{room_id}/messages')
def read_messages(room_id: str, after: int | None = None) -> dict:
    '''after 传上一批最后一条的 id 时只返回增量；不传则返回全部历史。'''

    _require_room(room_id)
    return {'roomId': room_id, 'messages': list_room_messages(room_id, after=after)}


@router.post('/{room_id}/messages')
def create_message(room_id: str, payload: RoomMessageRequest) -> dict:
    '''真人消息入库并回显；不调用任何模型，也不会自动生成对方的回复。'''

    room = _require_room(room_id)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail='消息内容不能为空')
    sender_id = payload.senderId.strip()
    known = {str(member.get('userId')) for member in (room.get('members') or [])} | DEMO_IDENTITIES
    if known and sender_id not in known:
        raise HTTPException(status_code=403, detail='该用户不在这个同行房间里')
    return append_room_message(room_id, sender_id, payload.senderName.strip(), content)