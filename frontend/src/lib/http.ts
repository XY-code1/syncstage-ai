// 极薄的 HTTP 层：只负责 fetch + 超时 + 错误归一化。
// 独立成模块，避免「api.ts <-> services/agent」互相 import 形成循环依赖。

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

export interface ApiErrorOptions {
  hint?: string
  status?: number | null
  upstreamStatus?: number | null
  detail?: string
}

export class ApiError extends Error {
  code: string
  hint: string
  status: number | null
  upstreamStatus: number | null
  detail: string

  constructor(message: string, code = 'UNKNOWN', options: ApiErrorOptions = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.hint = options.hint ?? ''
    this.status = options.status ?? null
    this.upstreamStatus = options.upstreamStatus ?? null
    this.detail = options.detail ?? ''
  }

  /** 给用户看的一行错误说明：原因 + 怎么修 */
  get display(): string {
    return this.hint ? `${this.message}（${this.hint}）` : this.message
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
  /** 请求超时（毫秒）。大模型对话需要更长的等待时间。 */
  timeoutMs?: number
}

/** 后端 /api/ai/status 的可安全下发字段（绝不含 API Key）。 */
export interface AiStatus {
  enabled: boolean
  reason: string
  /** 后端 AGENT_MODE：只有 live 才允许前端进入真实模型模式。 */
  agentMode?: string
  /** 网关状态：模式 / Provider / 模型 / 是否配置成功（绝不含密钥）。 */
  mode?: string
  provider?: string
  llmModel?: string
  configured?: boolean
  llm?: {
    mode: string
    provider: string
    model: string
    baseUrl: string
    timeoutSeconds: number
    configured: boolean
    reason: string
    keyConfigured: boolean
    liveMode: boolean
  }
  apiStyle: string
  baseUrl: string
  model: string
  chatUrl: string
  timeoutSeconds: number
  keyConfigured: boolean
  keyRequired: boolean
  forceFallback: boolean
}

/** 读取后端模型配置状态；失败会抛 ApiError，由调用方决定展示方式。 */
export async function fetchAiStatus(): Promise<AiStatus> {
  return apiRequest<AiStatus>('/api/ai/status', { timeoutMs: 8000 })
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, timeoutMs = 15000 } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(API_BASE + path, {
      method,
      headers: body ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const detail: unknown = payload && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : null
      if (detail && typeof detail === 'object') {
        const info = detail as { code?: string; message?: string; hint?: string; upstreamStatus?: number; detail?: string }
        throw new ApiError(info.message || '大模型调用失败', info.code || 'LLM', {
          hint: info.hint,
          status: response.status,
          upstreamStatus: info.upstreamStatus ?? null,
          detail: info.detail,
        })
      }
      const message = typeof detail === 'string' && detail ? detail : '后端返回了 ' + response.status
      throw new ApiError(message, 'HTTP', { status: response.status })
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('请求超时', 'TIMEOUT', { hint: '模型响应超过 ' + Math.round(timeoutMs / 1000) + ' 秒' })
    }
    throw new ApiError('无法连接后端服务，请确认后端已启动', 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}
