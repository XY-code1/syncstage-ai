'''演出相关接口。Phase 2 接入时前端可切换到这些接口。'''

from fastapi import APIRouter, HTTPException

from app.content import build_memory_card, build_room_tasks
from app.db import get_concert, get_user, list_attendees, list_concerts
from app.demo_data import DEMO_NOTICE
from app.schemas import MemoryCardRequest
from app.serializers import to_camel_keys

router = APIRouter(prefix='/api/concerts', tags=['concerts'])


@router.get('')
def read_concerts() -> dict:
    return {'notice': DEMO_NOTICE, 'items': [to_camel_keys(item) for item in list_concerts()]}


@router.get('/{concert_id}')
def read_concert(concert_id: str) -> dict:
    concert = get_concert(concert_id)
    if not concert:
        raise HTTPException(status_code=404, detail='这场演出暂时找不到了')
    return to_camel_keys(concert)


@router.get('/{concert_id}/attendees')
def read_attendees(concert_id: str) -> list[dict]:
    if not get_concert(concert_id):
        raise HTTPException(status_code=404, detail='这场演出暂时找不到了')
    return [to_camel_keys(item) for item in list_attendees(concert_id)]


@router.get('/{concert_id}/room-tasks')
def read_room_tasks(concert_id: str) -> list[dict]:
    concert = get_concert(concert_id)
    if not concert:
        raise HTTPException(status_code=404, detail='这场演出暂时找不到了')
    return build_room_tasks(concert)


@router.post('/{concert_id}/memory-card')
def read_memory_card(concert_id: str, payload: MemoryCardRequest) -> dict:
    concert = get_concert(concert_id)
    if not concert:
        raise HTTPException(status_code=404, detail='这场演出暂时找不到了')
    partner = get_user(payload.partnerId) if payload.partnerId else None
    companions = [user for user in (get_user(item) for item in payload.companionIds) if user]
    return build_memory_card(concert, partner, companions, payload.sharedSongs)
