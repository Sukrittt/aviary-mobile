// Feedback board. Twin of Web/src/api/ideas.ts; the server is Web/app/api/ideas.
import { apiFetch } from './client'
import type { VoteValue } from '@/src/lib/ideaVotes'

export type IdeaStatus = 'open' | 'planned' | 'in_progress' | 'shipped' | 'declined'
export type IdeaSort = 'top' | 'new'

export interface Idea {
  id: string
  title: string
  description: string
  authorFirstName: string | null
  status: IdeaStatus
  up: number
  down: number
  score: number
  createdAt: string
  myVote: VoteValue
  mine: boolean
}

// Bare messages on purpose, like ./feedback.ts: app/_layout.tsx bounces any
// error whose message matches /: 401\b/ to sign-in, and screens show their
// own copy instead of this text.
export async function listIdeas(sort: IdeaSort, status: IdeaStatus | null): Promise<Idea[]> {
  const resp = await apiFetch(`/api/ideas?sort=${sort}${status ? `&status=${status}` : ''}`)
  if (!resp.ok) throw new Error('failed')
  return (await resp.json()).ideas
}

export async function postIdea(title: string, description: string): Promise<void> {
  const resp = await apiFetch('/api/ideas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim(), description: description.trim() }),
  })
  if (resp.status === 429) throw new Error('rate_limited')
  if (!resp.ok) throw new Error('failed')
}

export async function voteIdea(id: string, value: VoteValue): Promise<{ up: number; down: number; score: number; myVote: VoteValue }> {
  const resp = await apiFetch(`/api/ideas/${encodeURIComponent(id)}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  if (!resp.ok) throw new Error('failed')
  return resp.json()
}
