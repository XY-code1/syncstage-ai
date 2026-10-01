import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PageShell } from '../components/PageShell'
import { Button, Card, DemoBadge, StateView } from '../components/ui'
import { useSession } from '../store/session'
import { useConcertFlow } from '../store/concertFlow'

export function MatchResultsPage() {
  const { concertId = '' } = useParams(); const navigate = useNavigate(); const { agent, agentRunning, agentStarting, runAgent, agentModeLabel } = useSession(); const { patchFlow } = useConcertFlow(concertId)
  const busy = agentRunning || agentStarting
  if (!agent || busy) return <PageShell title='匹配列表' step={3} onBack={() => navigate(`/concert/${concertId}/running`)}><StateView status={busy ? 'loading' : 'info'} title={busy ? 'Agent 正在匹配' : '还没有开始匹配'} description={busy ? undefined : 'Agent 只会在你点击「开始匹配」后运行。'} actionLabel={busy ? undefined : '开始匹配'} onAction={busy ? undefined : () => void runAgent()} secondaryLabel={busy ? undefined : '返回修改需求'} onSecondary={busy ? undefined : () => navigate(`/concert/${concertId}/task`)}/></PageShell>
  if (agent.status === 'error') return <PageShell title='匹配列表' step={3} onBack={() => navigate(`/concert/${concertId}/running`)}><StateView status='error' title='匹配失败' description={agent.error} actionLabel='重新运行' onAction={() => navigate(`/concert/${concertId}/running`)} secondaryLabel='返回修改需求' onSecondary={() => navigate(`/concert/${concertId}/task`)}/></PageShell>
  if (!agent.rankedCandidates.length) return <PageShell title='匹配列表' step={3} onBack={() => navigate(`/concert/${concertId}/running`)}><StateView status='empty' title='没有符合硬条件的候选人' description='Agent 不会伪造结果或自动放宽安全条件。' actionLabel='修改任务' onAction={() => navigate(`/concert/${concertId}/task`)}/></PageShell>
  return <PageShell title='匹配列表' subtitle={`${agent.rankedCandidates.length} 位同场候选人 · 生成组队方案`} step={3} onBack={() => navigate(`/concert/${concertId}/running`)} right={<DemoBadge label={agentModeLabel} />}>
    <div className='animate-fade space-y-3'>{agent.rankedCandidates.slice(0, 3).map((item) => <Card key={item.userId}><div className='flex items-center gap-3'><Avatar name={item.candidate.nickname} from={item.candidate.avatar.from} to={item.candidate.avatar.to} size={46}/><div className='min-w-0 flex-1'><h2 className='truncate text-base font-semibold'>{item.candidate.nickname}</h2><p className='text-sm text-brand-300'>综合匹配度 {item.score}%</p></div></div><div className='mt-3 grid gap-2 text-sm text-white/65'><p>共同歌曲：{item.sharedSongs.slice(0, 2).map((v) => `《${v}》`).join('、') || '暂无'}</p><p>同行目的：{item.sharedPurposes.slice(0, 2).join('、') || '同场观演'}</p><p>安全条件：{item.sharedSafety[0] || '公开场合见面'}</p><p className='text-warm-400'>差异提醒：{item.differences[0] || '无明显差异'}</p></div><Button className='mt-3' full variant='secondary' onClick={() => { patchFlow({ selectedCandidateId: item.userId }); navigate(`/concert/${concertId}/matches/${item.userId}`) }}>查看详情</Button></Card>)}</div>
  </PageShell>
}
