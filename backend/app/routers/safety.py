'''同行邀请与举报接口（Demo 级别，不做真实通知与风控）。'''

from fastapi import APIRouter

from app.db import create_invite, create_report
from app.schemas import InviteRequest, ReportRequest

router = APIRouter(prefix='/api', tags=['safety'])


@router.post('/invites')
def post_invite(payload: InviteRequest) -> dict:
    return create_invite(payload.concertId or 'unknown', 'me', payload.toUserId)


@router.post('/reports')
def post_report(payload: ReportRequest) -> dict:
    return create_report(payload.reason, payload.targetUserId, payload.concertId)
