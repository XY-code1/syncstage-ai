import { useNavigate, useParams } from 'react-router-dom'
import { AgentEvidenceBody } from '../components/AgentEvidence'
import { PageShell } from '../components/PageShell'
import { MockNotice } from '../components/QQMusicBar'
import { DemoBadge, StateView } from '../components/ui'
import { useSession } from '../store/session'

/**
 * 「查看 Agent 工作过程」二级页面。
 * 完整的工具调用记录、输入输出摘要、被排除的人与得分构成都放在这里，
 * 一级进度页因此可以只保留四个阶段。
 */
export function AgentTracePage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { agent, judgeMode } = useSession()

  if (!agent) {
    return (
      <PageShell title='Agent 工作过程' subtitle='二级页面 · 完整工具轨迹' onBack={() => navigate(-1)}>
        <StateView
          status='empty'
          title='还没有可查看的工作过程'
          description='先执行一次 Agent 任务，这里会保存全部工具调用记录。'
          actionLabel='去执行任务'
          onAction={() => navigate(`/concert/${concertId}/task`)}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title='Agent 工作过程'
      subtitle={`${agent.trace.length} 次工具调用 · 记录完整保留`}
      onBack={() => navigate(-1)}
      right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
    >
      <div className='animate-fade flex flex-col gap-4'>
        <AgentEvidenceBody agent={agent} focus={agent.rankedCandidates[0] ?? null} />
        <MockNotice compact />
      </div>
    </PageShell>
  )
}
