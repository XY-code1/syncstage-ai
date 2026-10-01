import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PageShell } from '../components/PageShell'
import { EvidenceList, ScoreBars } from '../components/AgentEvidence'
import { Button, Card, SectionTitle, StateView } from '../components/ui'
import { useSession } from '../store/session'
import { useConcertFlow } from '../store/concertFlow'

export function CandidateDetailPage() {
  const { concertId = '', candidateId = '' } = useParams(); const navigate = useNavigate(); const { agent } = useSession(); const { patchFlow } = useConcertFlow(concertId)
  const item = agent?.rankedCandidates.find((v) => v.userId === candidateId)
  if (!item) return <PageShell title='候选人详情' step={3} onBack={() => navigate(`/concert/${concertId}/matches`)}><StateView status='empty' title='候选人不存在或结果已过期' actionLabel='返回匹配列表' onAction={() => navigate(`/concert/${concertId}/matches`)}/></PageShell>
  return <PageShell title='候选人详情' subtitle='生成组队方案 · 完整证据与评分' step={3} onBack={() => navigate(`/concert/${concertId}/matches`)} footer={<Button full size='lg' onClick={() => { patchFlow({ selectedCandidateId: candidateId }); navigate(`/concert/${concertId}/handshake/${candidateId}`) }}>查看 Agent 预沟通报告</Button>} footerFixed>
    <div className='animate-fade space-y-4'><Card><div className='flex items-center gap-3'><Avatar name={item.candidate.nickname} from={item.candidate.avatar.from} to={item.candidate.avatar.to} size={52}/><div><h1 className='text-lg font-semibold'>{item.candidate.nickname}</h1><p className='text-sm text-brand-300'>综合匹配度 {item.score}%</p></div></div><p className='mt-3 text-sm leading-relaxed text-white/75'>{item.matchReason}</p></Card><Card><SectionTitle title='四维评分组成'/><ScoreBars breakdown={item.scoreBreakdown}/></Card><Card><SectionTitle title='全部匹配证据' hint='每条证据均标注数据来源'/><EvidenceList candidate={item}/></Card><Card><SectionTitle title='安全过滤记录'/><p className='text-sm leading-relaxed text-white/65'>同场演出校验通过；安全硬条件校验通过。差异项：{item.differences.join('；') || '无明显差异'}。</p></Card></div>
  </PageShell>
}

