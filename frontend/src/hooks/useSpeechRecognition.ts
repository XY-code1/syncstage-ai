import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * 真实语音转文字（浏览器 Web Speech API）。
 * 状态覆盖：unsupported / idle / listening / processing / denied / error
 * 识别结果只写入输入框，由用户确认后再发送，不上传任何音频。
 */

export type SpeechStatus = 'unsupported' | 'idle' | 'listening' | 'processing' | 'denied' | 'error'

interface RecognitionAlternative {
  transcript: string
}

interface RecognitionResult {
  isFinal: boolean
  length: number
  [index: number]: RecognitionAlternative
}

interface RecognitionEvent {
  resultIndex: number
  results: { length: number; [index: number]: RecognitionResult }
}

interface RecognitionErrorEvent {
  error: string
  message?: string
}

interface RecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

type RecognitionCtor = new () => RecognitionInstance

function getCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

function messageFor(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '浏览器拒绝了麦克风权限'
    case 'no-speech':
      return '没有听清，请再说一次'
    case 'audio-capture':
      return '没有找到可用的麦克风设备'
    case 'network':
      return '浏览器的语音识别服务需要联网'
    case 'aborted':
      return '录音已取消'
    default:
      return '语音识别失败（' + code + '）'
  }
}

export interface SpeechRecognitionApi {
  supported: boolean
  status: SpeechStatus
  transcript: string
  error: string
  start: () => Promise<void>
  stop: () => void
  retry: () => Promise<void>
  reset: () => void
}

export function useSpeechRecognition(onFinal: (text: string) => void, lang = 'zh-CN'): SpeechRecognitionApi {
  const supported = useMemo(() => getCtor() !== null, [])
  const [status, setStatus] = useState<SpeechStatus>(supported ? 'idle' : 'unsupported')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState('')
  const recognitionRef = useRef<RecognitionInstance | null>(null)
  const finalTextRef = useRef('')
  const finalCallback = useRef(onFinal)
  finalCallback.current = onFinal

  const teardown = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        // 已经结束的实例 abort 会抛错，忽略即可
      }
    }
  }, [])

  useEffect(() => teardown, [teardown])

  const start = useCallback(async () => {
    const Ctor = getCtor()
    if (!Ctor) {
      setStatus('unsupported')
      setError('当前浏览器不支持语音识别，请使用桌面版 Chrome / Edge')
      return
    }
    teardown()
    setError('')
    setTranscript('')
    finalTextRef.current = ''

    // 先真实申请麦克风权限，这样"权限被拒"能给出准确提示
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((track) => track.stop())
      }
    } catch (permissionError) {
      const name = permissionError instanceof DOMException ? permissionError.name : ''
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setStatus('denied')
        setError('你没有授权麦克风，浏览器不会再弹出提示，请在地址栏权限里重新允许')
      } else if (name === 'NotFoundError') {
        setStatus('error')
        setError('没有找到可用的麦克风设备')
      } else {
        setStatus('error')
        setError('无法访问麦克风：' + (permissionError instanceof Error ? permissionError.message : String(permissionError)))
      }
      return
    }

    const recognition = new Ctor()
    recognition.lang = lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setStatus('listening')
    }
    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) final += text
        else interim += text
      }
      if (interim) setTranscript((prev) => (final ? prev : interim))
      if (final.trim()) {
        finalTextRef.current = final.trim()
        setTranscript(final.trim())
        setStatus('processing')
        finalCallback.current(final.trim())
      }
    }
    recognition.onerror = (event) => {
      const code = event.error || 'unknown'
      if (code === 'not-allowed' || code === 'service-not-allowed') setStatus('denied')
      else if (code === 'aborted') setStatus('idle')
      else setStatus('error')
      if (code !== 'aborted') setError(messageFor(code))
      recognitionRef.current = null
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setStatus((prev) => {
        if (prev === 'listening') {
          setError('没有识别到内容，请重试')
          return 'error'
        }
        if (prev === 'processing') return 'idle'
        return prev
      })
    }

    try {
      recognition.start()
    } catch (startError) {
      recognitionRef.current = null
      setStatus('error')
      setError('无法启动语音识别：' + (startError instanceof Error ? startError.message : String(startError)))
    }
  }, [lang, teardown])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    setStatus('processing')
    try {
      recognition.stop()
    } catch {
      setStatus('idle')
    }
  }, [])

  const retry = useCallback(async () => {
    setError('')
    setTranscript('')
    await start()
  }, [start])

  const reset = useCallback(() => {
    teardown()
    setStatus(supported ? 'idle' : 'unsupported')
    setTranscript('')
    setError('')
  }, [supported, teardown])

  return { supported, status, transcript, error, start, stop, retry, reset }
}