import { apiFetch, apiErrorMessage } from './client'

export async function getGroups(): Promise<string[]> {
  const resp = await apiFetch('/api/groups')
  if (!resp.ok) throw new Error(`Failed to load groups: ${resp.status}`)
  return resp.json()
}

/**
 * Each group's picked icon as [name, icon] pairs. Groups without one are left
 * out. Pairs, not a Map: the query cache is saved to disk as JSON, where a Map
 * comes back as a plain object. useGroupIcons builds the Map.
 */
export async function getGroupIcons(): Promise<[string, string][]> {
  const resp = await apiFetch('/api/groups?icons=1')
  if (!resp.ok) throw new Error(`Failed to load groups: ${resp.status}`)
  const rows: { name: string; icon?: string }[] = await resp.json()
  return rows.flatMap((r): [string, string][] => (r.icon ? [[r.name, r.icon]] : []))
}

export async function addGroup(name: string): Promise<void> {
  const resp = await apiFetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to add group'))
}

export async function updateGroup(name: string, updates: { newName?: string; icon?: string }): Promise<void> {
  const resp = await apiFetch('/api/groups', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...updates }),
  })
  if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to update group'))
}

export async function deleteGroup(name: string): Promise<void> {
  const resp = await apiFetch('/api/groups', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) throw new Error(`Failed to delete group: ${resp.status}`)
}

export async function moveGroup(name: string, toIndex: number): Promise<void> {
  const resp = await apiFetch('/api/groups/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, toIndex }),
  })
  if (!resp.ok) throw new Error(`Failed to move group: ${resp.status}`)
}
