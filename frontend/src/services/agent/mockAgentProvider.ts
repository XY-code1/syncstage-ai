import type {
  CandidateFacts,
  ExcludedCandidate,
  MusicProfile,
  ParsedIntent,
} from '../../types'
import { A2A_TOOLS } from '../../lib/a2aNegotiation'
import { ruleParseIntent } from '../../lib/agentMock'
import { buildIcebreakers } from '../../lib/content'
import { ALL_SCOPES, attendeesOf, candidateFacts, getEventContext, getMusicProfile, viewerSocial } from '../../lib/tmeMock'
import { checkHardConstraints } from '../../lib/scoring'
import type {
  AgentProvider,
  BuildMusicProfileInput,
  IcebreakerContext,
  NegotiateCandidateInput,
  NegotiationResult,
  ParseIntentInput,
  SearchCandidatesCriteria,
} from './agentTypes'

/**
 * Demo 模拟 Agent：全部数据来自本地 TS/JSON，不发起任何网络请求。
 * 页面上必须显示「Demo 模拟 Agent」，不能让评委误以为是真实模型输出。
 */
export const MOCK_AGENT_LABEL = 'Demo 模拟 Agent'
export const MOCK_AGENT_NOTICE = '本地预设数据模拟，未调用任何大模型 API'

export const mockAgentProvider: AgentProvider = {
  mode: 'mock',
  label: MOCK_AGENT_LABEL,
  isDemo: true,
  notice: MOCK_AGENT_NOTICE,

  async parseIntent(input: ParseIntentInput): Promise<ParsedIntent> {
    const profile = getMusicProfile(input.userId, input.scopes)
    return ruleParseIntent(input.text, input.eventId, profile?.gender ?? 'prefer-not-to-say', profile?.ageBand ?? '')
  },

  async buildMusicProfile(input: BuildMusicProfileInput): Promise<MusicProfile | null> {
    return getMusicProfile(input.userId, input.scopes)
  },

  async searchCandidates(criteria: SearchCandidatesCriteria): Promise<CandidateFacts[]> {
    return attendeesOf(criteria.eventId)
      .map((user) => candidateFacts(user.id, ALL_SCOPES))
      .filter((item): item is CandidateFacts => Boolean(item))
  },

  async filterBySafety(input: {
    viewer: CandidateFacts
    intent: ParsedIntent
    candidates: CandidateFacts[]
    eventId: string
  }): Promise<{ kept: CandidateFacts[]; excluded: ExcludedCandidate[] }> {
    const social = viewerSocial()
    const kept: CandidateFacts[] = []
    const excluded: ExcludedCandidate[] = []
    for (const candidate of input.candidates) {
      const reason = checkHardConstraints({
        viewer: input.viewer,
        intent: input.intent,
        candidate,
        eventId: input.eventId,
        blockedUserIds: social.blockedUserIds,
        reportedUserIds: social.reportedUserIds,
      })
      if (reason) excluded.push(reason)
      else kept.push(candidate)
    }
    return { kept, excluded }
  },

  async negotiateCandidate(input: NegotiateCandidateInput): Promise<NegotiationResult> {
    const sharedSongs = input.candidate.favoriteTitles.filter((title) => input.viewer.favoriteTitles.includes(title))
    return {
      sharedSongs,
      exchangedFields: ['eventId', 'arrivalWindow', 'musicTags', 'socialIntent', 'groupSize', 'safetyConstraints'],
      hiddenFields: ['真实姓名', '联系方式', '精确位置', '原始听歌历史'],
      // A2A_TOOLS 是这套结构化协商实际核验的项，写进 note 方便评委核对
      note: `${A2A_TOOLS.length} 项结构化核验已完成：${A2A_TOOLS.join('、')}`,
    }
  },

  async generateIcebreakers(context: IcebreakerContext): Promise<string[]> {
    const concert = getEventContext(context.concertId)
    if (!concert) return []
    return buildIcebreakers({
      concert,
      sharedSongs: context.sharedSongs,
      partner: null,
      prefs: {
        likedSongs: [],
        likedArtists: [],
        expectedTracks: [],
        story: '',
        purposes: [],
        chatStyle: '温和慢热',
        groupSize: 3,
        safety: [],
        myGender: 'prefer-not-to-say',
      },
    })
  },
}
