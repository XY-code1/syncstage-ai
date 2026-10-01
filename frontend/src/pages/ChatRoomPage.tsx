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
import { cn } from '../lib/cn'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { useSocial } from '../store/social'
import type { ChatMessage } from '../store/social'

const REPORT_REASONS = ['包含敏感信息', '骚扰或不当言论', '诱导私下转账', '其它原因']

const VOICE_HELP: Record<string, string> = {
  unsupported: '当前浏览器不支持语音识别，请使用桌面版 Chrome / Edge',
  denied: '麦克风权限被拒绝，请在地址栏的权限设置里重新允许',
}

export function ChatRoomPage() {
  const { threadId = '' } = useParams()
  const navigate = useNavigate()
  const { threadOf, messagesOf, send, retry, markRead, acceptCard, agentStateOf } = useSocial()
  const { profile } = useProfile()
  const { pushToast, room } = useSession()
  const [input, setInput] = useState('')
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null)
  const [reportReason, setReportReason] = useState('')
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
        <p className='pt-2 text-center text-[10px] text-white/30'>
          不交换私人联系方式 · Agent 回复由真实大模型生成 · 活动结束 24 小时后房间自动归档
        </p>
      </div>

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

        {mine || agent || message.authorId === 'agent' ? null : (
          <button type='button' onClick={onReport} className='mt-1 text-[10px] text-white/25'>
            举报消息
          </button>
        )}
      </div>
    </div>
  )
}