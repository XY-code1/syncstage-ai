'''匹配与破冰话题接口。'''

from fastapi import APIRouter, HTTPException

from app.db import get_concert, list_attendees
from app.matching import compute_matches
from app.schemas import IcebreakerRequest, MatchesRequest
from app.serializers import to_camel_keys
from app.services.ai_client import generate_icebreakers

router = APIRouter(prefix='/api/concerts', tags=['matching'])


@router.post('/{concert_id}/matches')
def read_matches(concert_id: str, payload: MatchesRequest) -> dict:
    if not get_concert(concert_id):
        raise HTTPException(status_code=404, detail='这场演出暂时找不到了')
    pool = [to_camel_keys(item) for item in list_attendees(concert_id)]
    return compute_matches(payload.prefs.as_dict(), pool, payload.relax)


@router.post('/{concert_id}/icebreakers')
async def read_icebreakers(concert_id: str, payload: IcebreakerRequest) -> dict:
    concert = get_concert(concert_id)
    if not concert:
        raise HTTPException(status_code=404, detail='这场演出暂时找不到了')
    questions = await generate_icebreakers(concert, payload.prefs.as_dict(), payload.sharedSongs)
    return {'questions': questions}
