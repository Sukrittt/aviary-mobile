import { apiFetch } from './client'

/** Twin of Web/src/lib/changelog.ts's `ChangelogRelease`, as the changelog routes return it. */
export interface ChangelogRelease {
  id: string
  platform: 'web' | 'mobile'
  title: string
  version: string
  highlights: string[]
  body: string
  /** Set on notes that ship over the air: the app waits until its running bundle was published at or after this. */
  otaAfter?: string | null
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

/** Every published mobile release, newest first. */
export async function listChangelog(): Promise<ChangelogRelease[]> {
  const resp = await apiFetch('/api/changelog?platform=mobile')
  if (!resp.ok) throw new Error(`Failed to load changelog: ${resp.status}`)
  return (await resp.json()).releases
}
