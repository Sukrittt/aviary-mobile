import { apiFetch, apiErrorMessage } from './client'

type GroupRow = { name: string; icon?: string; color?: string }

// One request feeds both reads: `?icons=1` carries the names too, and the
// groups and icons queries used to send two requests on every mount.
let rowsInFlight: Promise<GroupRow[]> | null = null
function getGroupRows(): Promise<GroupRow[]> {
  rowsInFlight ??= (async () => {
    const resp = await apiFetch('/api/groups?icons=1')
    if (!resp.ok) throw new Error(`Failed to load groups: ${resp.status}`)
    return (await resp.json()) as GroupRow[]
  })().finally(() => {
    rowsInFlight = null
  })
  return rowsInFlight
}

export async function getGroups(): Promise<string[]> {
  return (await getGroupRows()).map((r) => r.name)
}

/**
 * Each group's picked icon as [name, icon] pairs. Groups without one are left
 * out. Pairs, not a Map: the query cache is saved to disk as JSON, where a Map
 * comes back as a plain object. useGroupIcons builds the Map.
 */
export async function getGroupIcons(): Promise<[string, string][]> {
  return (await getGroupRows()).flatMap((r): [string, string][] => (r.icon ? [[r.name, r.icon]] : []))
}

/** Each group's picked colour as [name, color] pairs, like getGroupIcons. */
export async function getGroupColors(): Promise<[string, string][]> {
  return (await getGroupRows()).flatMap((r): [string, string][] => (r.color ? [[r.name, r.color]] : []))
}

/**
 * POST only takes the name, so a picked icon or colour follows as an update.
 * That update is best-effort: the group exists by then, and failing here would
 * send the user's retry into "already exists". Edit group can restyle it.
 */
export async function addGroup(name: string, style: { icon?: string; color?: string } = {}): Promise<void> {
  const resp = await apiFetch('/api/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!resp.ok) throw new Error(await apiErrorMessage(resp, 'Failed to add group'))
  if (style.icon || style.color) await updateGroup(name, style).catch(() => {})
}

export async function updateGroup(name: string, updates: { newName?: string; icon?: string; color?: string }): Promise<void> {
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
