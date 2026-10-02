import { useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { Button, Card, SectionTitle, StateView } from '../components/ui'
import { useSession } from '../store/session'
import { useConcertFlow } from '../store/concertFlow'

/**
 * Agent 预沟通报告 + 双向确认入口。
 *
 * 状态机（与后端 orchestrator / agentMock 对齐）：
 *   awaiting_user  Agent 只是"推荐了谁"，还没有真正发出邀请
 *   awaiting_peer  邀请已发出，等对方确认（可以模拟对方确认）
 *   both_confirmed 双方都确认，才允许创建临时房间
 * 按钮必须按 status 判断；只看 candidateId 会把"推荐"误当成"已邀请"，
 * 于是直接调用对方确认接口拿到 409，房间永远建不出来。
 */
export function HandshakePage() {
  const { concertId = '', candidateId = '' } = useParams()
  const navigate = useNavigate()
  const { agent, invite, peerConfirm, room } = useSession()
  const { flow, patchFlow } = useConcertFlow(concertId)

  const report = agent?.handshakeReports?.[candidateId]
  const pending = agent?.pendingConfirmation
  const pendingStatus = pending?.status
  const backTo = () => navigate(`/concert/${concertId}/matches/${candidateId}`)

  if (!report) {
    return (
      <PageShell title='Agent 预沟通报告' step={3} onBack={backTo}>
        <StateView status='empty' title='预沟通报告尚未生成' />
      </PageShell>
    )
  }

  const invitedThisCandidate = pending?.candidateId === candidateId && pendingStatus === 'awaiting_peer'
  const confirmed =
    flow.handshakeStatus === 'confirmed' ||
    (pending?.candidateId === candidateId && (pendingStatus === 'accepted' || pendingStatus === 'both_confirmed' || pendingStatus === 'confirmed'))

  const footer = (
    <div>
      {confirmed ? (
        <Button
          full
          size='lg'
          onClick={() => navigate(room ? `/concert/${concertId}/room` : '/sync', { replace: true })}
        >
          进入临时群聊
        </Button>
      ) : invitedThisCandidate ? (
        <div className='grid grid-cols-2 gap-2'>
          <Button variant='secondary' onClick={() => void peerConfirm(false)}>暂不同行</Button>
          <Button onClick={async () => { if (await peerConfirm(true)) patchFlow({ handshakeStatus: 'confirmed' }) }}>接受同行</Button>
        </div>
      ) : (
        <Button
          full
          size='lg'
          onClick={() => {
            patchFlow({ selectedCandidateId: candidateId, handshakeStatus: 'reviewed' })
            void invite(candidateId)
          }}
        >
          确认报告并邀请同行
        </Button>
      )}
    </div>
  )

  return (
    <PageShell
      title='Agent 预沟通报告'
      subtitle='生成组队方案 · 匿名结构化协商'
      step={3}
      onBack={backTo}
      footer={footer}
      footerFixed
    >
      <div className='animate-fade space-y-3'>
        <Notice title='一致条件' items={report.agreements} />
        <Notice title='冲突条件' items={report.conflicts.length ? report.conflicts : ['未发现安全硬冲突']} />
        <Notice title='待真人确认' items={report.needsHumanConfirmation} />
        <Notice title='使用的数据证据' items={report.evidence.map((v) => `${v.field}：${v.value}`)} />
        <Card>
          <SectionTitle title='隐私边界' />
          <p className='text-sm leading-relaxed text-white/60'>
            未交换：{report.hiddenFields.join('、')}。Agent 之间不会自由聊天。
          </p>
        </Card>
      </div>
    </PageShell>
  )
}

function Notice({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <SectionTitle title={title} />
      <div className='space-y-2'>
        {items.map((v) => (
          <p key={v} className='rounded-xl bg-white/[.035] p-2.5 text-sm text-white/70'>
            {v}
          </p>
        ))}
      </div>
    </Card>
  )
}
