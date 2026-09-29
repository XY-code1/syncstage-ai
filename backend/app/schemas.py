'''接口请求 / 响应模型。'''

from pydantic import BaseModel, Field


class PreferencesPayload(BaseModel):
    likedSongs: list[str] = Field(default_factory=list)
    likedArtists: list[str] = Field(default_factory=list)
    expectedTracks: list[str] = Field(default_factory=list)
    story: str = ''
    purposes: list[str] = Field(default_factory=list)
    chatStyle: str = '温和慢热'
    groupSize: int = 3
    safety: list[str] = Field(default_factory=list)
    myGender: str = 'prefer-not-to-say'

    def as_dict(self) -> dict:
        return self.model_dump()


class MatchesRequest(BaseModel):
    prefs: PreferencesPayload
    relax: bool = False


class IcebreakerRequest(BaseModel):
    prefs: PreferencesPayload = Field(default_factory=PreferencesPayload)
    sharedSongs: list[str] = Field(default_factory=list)
    partnerId: str | None = None


class MemoryCardRequest(BaseModel):
    prefs: PreferencesPayload = Field(default_factory=PreferencesPayload)
    sharedSongs: list[str] = Field(default_factory=list)
    partnerId: str | None = None
    companionIds: list[str] = Field(default_factory=list)


class InviteRequest(BaseModel):
    toUserId: str
    concertId: str | None = None


class ReportRequest(BaseModel):
    reason: str
    targetUserId: str | None = None
    concertId: str | None = None
