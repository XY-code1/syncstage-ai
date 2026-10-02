import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { UserAvatar } from '../components/UserAvatar'
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  LoaderIcon,
  MapPinIcon,
  MicIcon,
  SendIcon,
  SparkleIcon,
  StopIcon,
} from '../components/icons'
import { Button, Sheet } from '../components/ui'
import { sendAgentChat } from '../lib/api'
import { cn } from '../lib/cn'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { useSocial } from '../store/social'
import type { ChatMessage } from '../store/social'

const REPORT_REASONS = ['包含敏感信息', '骚扰或不当言论', '诱导私下转账', '其它原因']

/** Agent 润色面板的状态：只会把结果填进输入框，绝不自动发送。 */
type PolishState = { status: 'idle' | 'loading' | 'done' | 'error'; text: string; error: string }

const VOICE_HELP: Record<string, string> = {
  unsupported: '当前浏览器不支持语音识别，请使用桌面版 Chrome / Edge',
  denied: '麦克风权限被拒绝，请在地址栏的权限设置里重新允许',
}

export function ChatRoomPage() {
  const { threadId = '' } = useParams()
  const navigate = useNavigate()
  const { threadOf, messagesOf, send, retry, markRead, acceptCard, agentStateOf, simulatePeerReply } = useSocial()
  const { profile } = useProfile()
  const { pushToast, room, concertId } = useSession()
  const [input, setInput] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [polishOpen, setPolishOpen] = useState(false)
  const [polishSource, setPolishSource] = useState('')
  const [polish, setPolish] = useState<PolishState>({ status: 'idle', text: '', error: '' })
  const bottomRef = useRef<HTMLDivElement>(null)

  const thread = threadOf(threadId)
  const messages = messagesOf(threadId)
  const agentState = agentStateOf(threadId)

  const speech = useSpeechRecognition((text) => {
    setInput(text)
    pushToast('识别完成，确认后再发送', 'success')
  })

  useEffect(() => {
    markRead(threadId)
  }, [threadId, markRead])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, agentState.status])

  useEffect(() => {
    speech.reset()
    setVoiceOpen(false)
    // 切换会话时重置语音状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId])

  const readOnly = thread?.kind === 'system'
  const thinking = agentState.status === 'sending' || agentState.status === 'thinking'
  // 真人与真人的私聊：不接任何 AI 自动回复，只推进"发送中 → 已送达 → 等待对方回复"。
  const isDirect = thread?.kind === 'dm'
  // 「触发模拟回复」只出现在真人私聊里：本构建的所有联系人都来自本地虚构 Demo 数据，
  // 触发出来的消息一定带「模拟联系人」标记，绝不冒充真人、也不冒充模型。
  const demoMode = isDirect
  const lastMessage = [...messages].reverse().find((message) => !message.system)
  const waitingReply = Boolean(isDirect && lastMessage?.mine && !lastMessage?.pending)

  const runPolish = async (source: string) => {
    setPolish({ status: 'loading', text: '', error: '' })
    try {
      const reply = await sendAgentChat({
        threadId,
        threadKind: 'agent',
        concertId: room?.concertId || concertId,
        messages: [
          {
            role: 'user',
            content:
              `请帮我润色下面这条准备发给「${thread?.title ?? '同行者'}」的消息：保持原意、口语自然、不超过 60 字，` +
              '不要替我添加没说过的事。只输出润色后的那句话，不要解释、不要加引号。\n\n' +
              source,
          },
        ],
      })
      const text = reply.reply.trim()
      if (!text) {
        setPolish({ status: 'error', text: '', error: '模型没有返回可用内容，请重试' })
        return
      }
      setPolish({ status: 'done', text, error: '' })
    } catch (error) {
      setPolish({
        status: 'error',
        text: '',
        error: error instanceof Error ? error.message : '润色失败，请稍后重试',
      })
    }
  }

  const submit = () => {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    void send(threadId, text)
  }

  return (
    <div className='flex h-screen flex-col bg-stage-950'>
      <header className='safe-top sticky top-0 z-30 border-b border-white/6 bg-stage-950/94 px-3 pb-2.5 pt-2 backdrop-blur-xl'>
        <div className='flex items-center gap-2.5'>
          <button
            type='button'
            onClick={() => navigate('/messages')}
            aria-label='返回消息列表'
            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70'
          >
            <ArrowLeftIcon className='h-4 w-4' />
          </button>
          <div className='min-w-0 flex-1'>
            <p className='truncate text-[14px] font-semibold text-white'>{thread?.title ?? '会话'}</p>
            <p className='truncate text-[10.5px] text-white/45'>
              {thread?.members ? `${thread.members} 位成员 · 临时房间` : thread?.subtitle ?? '演示会话'}
            </p>
          </div>
          {thread?.kind === 'group' && room ? (
            <button
              type='button'
              onClick={() => navigate(`/concert/${room.concertId}/room`)}
              className='shrink-0 rounded-pill border border-white/12 px-2.5 py-1 text-[10.5px] text-white/65'
            >
              房间详情
            </button>
          ) : null}
        </div>
      </header>

      <div className='flex-1 space-y-3 overflow-y-auto px-3.5 py-4'>
        {messages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            viewerName={profile.nickname}
            onAccept={() => {
              acceptCard(threadId, message.id)
              pushToast('已记下集合时间与地点', 'success')
            }}
            onReport={() => {
              setReportTarget(message)
              setReportReason('')
            }}
          />
        ))}

        {waitingReply && !thinking ? <StatusLine label='等待对方回复' /> : null}

        {agentState.status === 'sending' ? (
          <StatusLine label='消息已发出' />
        ) : null}
        {agentState.status === 'thinking' ? (
          <StatusLine label='同频 Agent ✨ 正在思考' spinner />
        ) : null}
        {agentState.status === 'failed' ? (
          <div className='rounded-2xl border border-rose-400/35 bg-rose-400/[0.08] p-3'>
            <p className='flex items-center gap-1.5 text-[12.5px] font-semibold text-rose-200'>
              <AlertIcon className='h-4 w-4' />
              Agent 回复失败
              {agentState.errorCode ? <span className='text-[10px] text-rose-200/60'>({agentState.errorCode})</span> : null}
            </p>
            <p className='mt-1.5 text-[11.5px] leading-relaxed text-rose-100/80'>{agentState.error}</p>
            {agentState.errorHint ? (
              <p className='mt-1 text-[10.5px] leading-relaxed text-rose-100/55'>{agentState.errorHint}</p>
            ) : null}
            <Button size='sm' className='mt-2.5' variant='secondary' onClick={() => void retry(threadId)}>
              重试这条消息
            </Button>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <div className='safe-bottom border-t border-white/8 bg-stage-950/96 px-3 pt-2.5 backdrop-blur-xl'>
        {voiceOpen ? (
          <VoicePanel
            status={speech.status}
            transcript={speech.transcript}
            error={speech.error}
            onStart={() => void speech.start()}
            onStop={() => speech.stop()}
            onRetry={() => void speech.retry()}
            onUseTranscript={() => {
              if (speech.transcript) setInput(speech.transcript)
              setVoiceOpen(false)
              speech.reset()
            }}
            onClose={() => {
              speech.reset()
              setVoiceOpen(false)
            }}
          />
        ) : null}

        {isDirect ? (
          <div className='mb-2 flex items-center gap-2'>
            <button
              type='button'
              onClick={() => {
                const draft = input.trim()
                if (!draft) {
                  pushToast('先写一句话，Agent 才能帮你润色', 'warn')
                  return
                }
                setPolishSource(draft)
                setPolish({ status: 'idle', text: '', error: '' })
                setPolishOpen(true)
                void runPolish(draft)
              }}
              className='flex min-h-9 items-center gap-1.5 rounded-pill border border-brand-500/35 bg-brand-500/10 px-3 text-[12.5px] text-brand-200'
            >
              <SparkleIcon className='h-3.5 w-3.5' />
              让 Agent 帮我润色
            </button>
            {demoMode ? (
              <button
                type='button'
                onClick={() => {
                  simulatePeerReply(threadId)
                  pushToast('已触发一条模拟联系人回复（Demo 演示）', 'warn')
                }}
                className='flex min-h-9 items-center gap-1.5 rounded-pill border border-warm-400/35 bg-warm-400/10 px-3 text-[12.5px] text-warm-400'
              >
                触发模拟回复
              </button>
            ) : null}
          </div>
        ) : null}

        {readOnly ? (
          <p className='pb-1 text-center text-[10.5px] text-white/35'>系统通知为只读</p>
        ) : (
          <div className='flex items-end gap-2'>
            <button
              type='button'
              onClick={() => {
                speech.reset()
                setVoiceOpen((prev) => !prev)
              }}
              aria-label='语音入口'
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition',
                voiceOpen ? 'border-brand-500/50 bg-brand-500/12 text-brand-200' : 'border-white/10 bg-white/[0.04] text-white/70',
              )}
            >
              <MicIcon className='h-4.5 w-4.5' />
            </button>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit()
                }
              }}
              rows={1}
              maxLength={200}
              placeholder={thinking ? '同频 Agent 正在回复…' : '说点什么，注意保护隐私'}
              className='max-h-24 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/25'
            />
            <button
              type='button'
              onClick={submit}
              disabled={!input.trim() || thinking}
              aria-label='发送'
              className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-stage-950 transition active:scale-95 disabled:opacity-40'
            >
              <SendIcon className='h-4.5 w-4.5' />
            </button>
          </div>
        )}
        <p className='pt-2 text-center text-[10.5px] leading-relaxed text-white/35'>
          {thread?.kind === 'group'
            ? '真人对话 · Agent 不参与自动回复 · 不交换私人联系方式'
            : isDirect
              ? '真人对话 · 不接入 AI 自动回复 · 不交换私人联系方式'
              : '不交换私人联系方式 · Agent 回复由真实大模型生成 · 活动结束 24 小时后归档'}
        </p>
      </div>

      <Sheet
        open={polishOpen}
        onClose={() => setPolishOpen(false)}
        title='让 Agent 帮我润色'
        description='润色结果只会填入输入框，需要你自己确认后再发送'
      >
        <div className='space-y-3'>
          <div className='rounded-2xl border border-white/8 bg-white/[0.03] p-3'>
            <p className='text-[11.5px] text-white/45'>你写的</p>
            <p className='mt-1 text-[13.5px] leading-relaxed text-ink-400'>{polishSource}</p>
          </div>
          <div className='rounded-2xl border border-brand-500/25 bg-brand-500/[0.07] p-3'>
            <p className='flex items-center gap-1.5 text-[11.5px] text-brand-200'>
              <SparkleIcon className='h-3.5 w-3.5' />
              润色后
            </p>
            {polish.status === 'loading' ? (
              <p className='mt-2 flex items-center gap-2 text-[13px] text-white/60'>
                <LoaderIcon className='h-4 w-4 animate-spin text-brand-300' />
                Agent 正在润色…
              </p>
            ) : polish.status === 'error' ? (
              <p className='mt-2 text-[12.5px] leading-relaxed text-rose-200'>{polish.error}</p>
            ) : (
              <p className='mt-2 text-[13.5px] leading-relaxed text-ink-100'>{polish.text || '—'}</p>
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              disabled={polish.status !== 'done'}
              onClick={() => {
                if (polish.status !== 'done') return
                setInput(polish.text)
                setPolishOpen(false)
                pushToast('已填入输入框，确认后再发送', 'success')
              }}
            >
              使用这条
            </Button>
            <Button size='sm' variant='secondary' disabled={polish.status === 'loading'} onClick={() => void runPolish(polishSource)}>
              重新润色
            </Button>
            <button type='button' className='ml-auto text-[12px] text-white/45' onClick={() => setPolishOpen(false)}>
              取消
            </button>
          </div>
          <p className='text-[11px] leading-relaxed text-white/35'>
            这是 Agent 的辅助建议，不会自动发送；发送前内容完全由你决定。
          </p>
        </div>
      </Sheet>

      <Sheet
        open={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        title='举报单条消息'
        description={reportTarget ? `来自 ${reportTarget.authorName}：${reportTarget.text}` : ''}
      >
        <div className='space-y-2'>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type='button'
              onClick={() => setReportReason(reason)}
              className={cn(
                'w-full rounded-xl border p-3 text-left text-[13px]',
                reportReason === reason ? 'border-rose-400/50 bg-rose-400/10 text-white' : 'border-white/10 text-white/75',
              )}
            >
              {reason}
            </button>
          ))}
          <Button
            variant='danger'
            full
            disabled={!reportReason}
            onClick={() => {
              setReportTarget(null)
              pushToast('举报已提交，Agent 已结束该会话', 'warn')
            }}
          >
            提交举报
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function StatusLine({ label, spinner }: { label: string; spinner?: boolean }) {
  return (
    <div className='flex justify-center'>
      <span className='inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-white/55'>
        {spinner ? <LoaderIcon className='h-3.5 w-3.5 animate-spin text-brand-300' /> : null}
        {label}
        {spinner ? <span className='flex gap-0.5'>
          <span className='h-1 w-1 animate-pulse rounded-full bg-brand-300' />
          <span className='h-1 w-1 animate-pulse rounded-full bg-brand-300 [animation-delay:150ms]' />
          <span className='h-1 w-1 animate-pulse rounded-full bg-brand-300 [animation-delay:300ms]' />
        </span> : null}
      </span>
    </div>
  )
}

function VoicePanel({
  status,
  transcript,
  error,
  onStart,
  onStop,
  onRetry,
  onUseTranscript,
  onClose,
}: {
  status: string
  transcript: string
  error: string
  onStart: () => void
  onStop: () => void
  onRetry: () => void
  onUseTranscript: () => void
  onClose: () => void
}) {
  const blocked = status === 'unsupported' || status === 'denied'

  return (
    <div className='mb-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-3'>
      <div className='flex items-center gap-2'>
        <SparkleIcon className='h-3.5 w-3.5 text-brand-300' />
        <p className='text-[12px] font-semibold text-white'>语音转文字</p>
        <button type='button' onClick={onClose} className='ml-auto text-[11px] text-white/40'>
          收起
        </button>
      </div>

      <div className='mt-2.5 flex items-center gap-3'>
        {status === 'listening' ? (
          <button
            type='button'
            onClick={onStop}
            className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-500/90 text-white'
            aria-label='停止录音'
          >
            <StopIcon className='h-5 w-5' />
          </button>
        ) : (
          <button
            type='button'
            onClick={onStart}
            className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-stage-950'
            aria-label='开始录音'
          >
            <MicIcon className='h-5 w-5' />
          </button>
        )}
        <div className='min-w-0 flex-1'>
          <p className='text-[11.5px] text-white/70'>
            {status === 'idle' && '点击麦克风，真实说一句话'}
            {status === 'listening' && '正在听你说…'}
            {status === 'processing' && '识别完成'}
            {status === 'unsupported' && '当前浏览器不支持语音识别'}
            {status === 'denied' && '麦克风权限被拒绝'}
            {status === 'error' && '识别失败'}
          </p>
          <p className='mt-0.5 truncate text-[11px] text-white/40'>
            {transcript || (blocked ? VOICE_HELP[status] : '识别结果会填入输入框，确认后再发送')}
          </p>
        </div>
      </div>

      {error ? <p className='mt-2 text-[10.5px] leading-relaxed text-rose-200/85'>{error}</p> : null}

      <div className='mt-2.5 flex gap-2'>
        {status === 'error' || status === 'denied' ? (
          <Button size='sm' variant='secondary' onClick={onRetry}>
            重试
          </Button>
        ) : null}
        {transcript ? (
          <Button size='sm' onClick={onUseTranscript}>
            填入输入框
          </Button>
        ) : null}
      </div>
      <p className='mt-2 text-[10px] leading-relaxed text-white/30'>
        使用浏览器内置语音识别，不会上传任何音频文件；本 Demo 暂不支持语音消息。
      </p>
    </div>
  )
}

function MessageRow({
  message,
  viewerName,
  onAccept,
  onReport,
}: {
  message: ChatMessage
  viewerName: string
  onAccept: () => void
  onReport: () => void
}) {
  if (message.system) {
    return (
      <div className='mx-auto max-w-[92%] rounded-xl border border-warm-400/20 bg-warm-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-warm-400'>
        <AlertIcon className='mr-1 inline h-3.5 w-3.5' />
        {message.text}
      </div>
    )
  }

  const mine = message.mine
  const agent = message.agent

  return (
    <div className={cn('flex gap-2', mine && 'flex-row-reverse')}>
      {agent ? (
        <span className='flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-brand-500 text-stage-950'>
          <SparkleIcon className='h-4 w-4' />
        </span>
      ) : (
        mine ? (
          <UserAvatar size={30} />
        ) : (
          <Avatar name={message.authorName} from='#4a7dff' to='#171a22' size={30} />
        )
      )}
      <div className={cn('max-w-[78%]', mine && 'text-right')}>
        <div className={cn('mb-1 flex items-center gap-1.5 text-[10px] text-white/35', mine && 'justify-end')}>
          {agent ? (
            <>
              <span className='font-semibold text-brand-200'>{message.authorName}</span>
              <span className='rounded-pill border border-brand-500/35 bg-brand-500/10 px-1.5 py-[1px] text-[9px] text-brand-200'>
                AGENT
              </span>
            </>
          ) : (
            <span>{mine ? viewerName : message.authorName}</span>
          )}
          <span>{message.time}</span>
          {message.pending ? <span className='text-white/30'>· 发送中</span> : null}
          {!message.pending && mine && message.delivery === 'delivered' ? (
            <span className='text-white/30'>· 已送达</span>
          ) : null}
          {message.simulated ? (
            <span className='rounded-pill border border-warm-400/40 bg-warm-400/12 px-1.5 py-[1px] text-[9px] text-warm-400'>
              模拟联系人
            </span>
          ) : null}
          {message.failed ? <span className='text-rose-300'>· 发送失败</span> : null}
        </div>
        <div
          className={cn(
            'rounded-2xl px-3 py-2 text-left text-[13px] leading-relaxed',
            mine
              ? 'rounded-tr-sm bg-brand-500 text-stage-950'
              : agent
                ? 'rounded-tl-sm border border-brand-500/22 bg-brand-500/[0.07] text-white/90'
                : 'rounded-tl-sm bg-white/[0.07] text-white/85',
          )}
        >
          {message.text}
        </div>

        {agent && message.meta ? (
          <p className='mt-1 text-[10px] text-white/30'>
            {message.meta.source === 'model'
              ? `真实模型 ${message.meta.model} · ${(message.meta.elapsedMs / 1000).toFixed(1)}s`
              : 'Demo 回退（未调用大模型）'}
          </p>
        ) : null}

        {message.card ? (
          <div className='mt-2 rounded-2xl border border-brand-500/22 bg-brand-500/[0.06] p-3.5 text-left'>
            <div className='flex items-center gap-2'>
              <span className='flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/16 text-brand-300'>
                <SparkleIcon className='h-3.5 w-3.5' />
              </span>
              <p className='text-[12.5px] font-semibold text-white'>{message.card.title}</p>
              <span className='ml-auto text-[10px] text-white/35'>Agent 建议</span>
            </div>
            <div className='mt-2.5 space-y-1.5 rounded-xl bg-black/25 px-3 py-2.5'>
              <p className='flex items-start gap-2 text-[12px] text-white'>
                <MapPinIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300' />
                {message.card.place || '集合地点待确认'}
              </p>
              <p className='flex items-start gap-2 text-[12px] text-white/80'>
                <ClockIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300' />
                {message.card.time || '集合时间待确认'}
              </p>
              {message.card.note ? (
                <p className='text-[10.5px] leading-relaxed text-white/40'>{message.card.note}</p>
              ) : null}
            </div>
            <div className='mt-2.5 flex gap-2'>
              {message.card.accepted ? (
                <span className='flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-brand-500/35 bg-brand-500/10 text-[12px] text-brand-200'>
                  <CheckIcon className='h-3.5 w-3.5' />
                  已记下集合安排
                </span>
              ) : (
                <Button size='sm' full onClick={onAccept}>
                  采纳这份建议
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {mine || agent || message.simulated || message.authorId === 'agent' ? null : (
          <button type='button' onClick={onReport} className='mt-1 text-[10px] text-white/25'>
            举报消息
          </button>
        )}
      </div>
    </div>
  )
}