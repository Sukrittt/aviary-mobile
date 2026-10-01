import { fetch as expoFetch } from 'expo/fetch'
import { apiFetch, BASE_URL, handleUnauthorized } from './client'
import { getValidToken, sessionGeneration, SessionChangedError } from './accessMode'
import { rejectIfAllowanceExceeded } from '@/src/lib/aiAllowance'

export interface BriefCard {
  icon: string
  title: string
  subtitle: string
  valueLabel: string
  amount: number
  tone: 'mint' | 'violet' | 'coral' | 'warn'
}

export interface Brief {
  narrative: string
  cards: BriefCard[]
  questions: string[]
  meta: {
    txnCountThisMonth: number
    totalSpent: number
    totalAssigned: number
    daysLeft: number
  }
}

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
}

export interface ChatSessionSummary {
  id: string
  title: string
  updatedAt: string
  preview: string
  messageCount: number
}

export interface ChatSessionDetail extends ChatSessionSummary {
  messages: ChatMessage[]
  createdAt: string
}

export interface ChatSessionsPage {
  sessions: ChatSessionSummary[]
  total: number
  page: number
  pageCount: number
}

export async function listChatSessions(params?: {
  page?: number
  limit?: number
  q?: string
}): Promise<ChatSessionsPage> {
  const qs = new URLSearchParams()
  if (params?.page) qs.set('page', String(params.page))
  if (params?.limit) qs.set('limit', String(params.limit))
  if (params?.q) qs.set('q', params.q)
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const resp = await apiFetch(`/api/ai/chat/sessions${suffix}`)
  if (!resp.ok) throw new Error(`Failed to load chat history: ${resp.status}`)
  return resp.json()
}

export async function getChatSession(id: string): Promise<ChatSessionDetail> {
  const resp = await apiFetch(`/api/ai/chat/sessions/${id}`)
  if (!resp.ok) throw new Error(`Failed to load chat: ${resp.status}`)
  return resp.json()
}

export async function fetchBrief(): Promise<Brief> {
  const resp = await apiFetch('/api/ai/brief')
  // Not `notify`: the brief loads on its own, so a spent allowance is a quiet
  // note on the card, not a screen the user never asked for.
  await rejectIfAllowanceExceeded(resp, false, 'brief')
  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new Error(detail.error ?? `Failed to load brief: ${resp.status}`)
  }
  return resp.json()
}

/**
 * Streams /api/ai/chat via expo/fetch (RN's global fetch can't read streaming
 * bodies under Hermes). Buffers decoded text and splits on the SSE frame
 * delimiter ("\n\n"), calling onDelta for each `data: {"delta":...}` frame.
 *
 * `messages` is sent in full (as before) rather than just the newest one:
 * the client can't tell ahead of the request whether it'll land as a signed-in
 * user (persisted, session-scoped) or the read-only demo user (stateless,
 * needs the whole history every call) — same body either way. `sessionId`
 * additionally threads a persisted session through for signed-in users: pass
 * the session's id to append to it, or null to start a new one — the server
 * creates it and sends its id back as the first frame, which this returns so
 * the caller can remember it. Ignored server-side for the demo user.
 */
export async function streamChat(
  sessionId: string | null,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  const generation = sessionGeneration()
  const token = await getValidToken()
  if (generation !== sessionGeneration()) throw new SessionChangedError()
  const resp = await expoFetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ sessionId, messages }),
    signal,
  })

  // Bypasses apiFetch (needs expo/fetch for streaming), so this path must
  // separately route a revoked session into the same sign-in bounce.
  if (generation !== sessionGeneration()) throw new SessionChangedError()
  await handleUnauthorized(resp, token)
  await rejectIfAllowanceExceeded(resp, true, 'chat')

  if (!resp.ok) {
    const detail = await resp.json().catch(() => ({}))
    throw new Error(detail.error ?? `Failed to chat: ${resp.status}`)
  }
  if (!resp.body) throw new Error('Failed to chat: empty response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let resolvedSessionId = sessionId

  for await (const chunk of resp.body) {
    if (generation !== sessionGeneration()) throw new SessionChangedError()
    buffer += decoder.decode(chunk, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() ?? ''
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      const payload = line.slice('data: '.length)
      if (payload === '[DONE]') return resolvedSessionId
      const parsed = JSON.parse(payload)
      if (parsed.error) throw new Error(parsed.error)
      if (typeof parsed.sessionId === 'string') resolvedSessionId = parsed.sessionId
      if (typeof parsed.delta === 'string') onDelta(parsed.delta)
    }
  }
  return resolvedSessionId
}
