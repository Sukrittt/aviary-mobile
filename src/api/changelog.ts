import { apiFetch } from './client'

/** Twin of Web/src/lib/changelog.ts's `ChangelogRelease`, as the changelog routes return it. */
export interface ChangelogRelease {
  id: string
  platform: 'web' | 'mobile'
  title: string
  version: string
  highlights: string[]
  body: string
  publishedAt: string | null
}

/** The newest mobile release this account hasn't seen, or null (also null for accounts newer than it). */
export async function getLatestChangelog(): Promise<ChangelogRelease | null> {
  const resp = await apiFetch('/api/changelog/latest?platform=mobile')
  if (!resp.ok) throw new Error(`Failed to load changelog: ${resp.status}`)
  return (await resp.json()).release
}

/** Marks it seen. Only the first device to call this gets the release back; the rest get null. */
export async function claimChangelog(id: string): Promise<ChangelogRelease | null> {
  const resp = await apiFetch(`/api/changelog/${id}/seen`, { method: 'POST' })
  if (!resp.ok) throw new Error(`Failed to mark changelog seen: ${resp.status}`)
  return (await resp.json()).release
}
