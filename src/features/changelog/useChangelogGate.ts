import { useEffect } from 'react'
import { AppState } from 'react-native'
import { router } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import appJson from '@/app.json'
import { claimChangelog, getLatestChangelog, type ChangelogRelease } from '@/src/api/changelog'
import { currentUserId } from '@/src/api/accessMode'
import { useWeekRecap } from '@/src/features/week-recap/useWeekRecap'
import { isVersionNewer } from '@/src/lib/version'

export const changelogKey = ['changelog', 'mobile'] as const

// The claimed release the What's new screen renders. Claiming marks it seen on
// the server, so this copy is the only one left to show.
let shown: ChangelogRelease | null = null
export function shownRelease(): ChangelogRelease | null {
  return shown
}

// Per account, so a failed claim can retry but a success never reopens it this session.
const attempted = new Set<string>()

/**
 * Opens What's new on its own, once per account, for the newest mobile release
 * only: three releases since the last open still means one screen. The server
 * skips accounts created after the release. Waits for the first-week recap so
 * the two never stack, and for an app update when the release's version label
 * is newer than this install.
 */
export function useChangelogGate(): void {
  const qc = useQueryClient()
  const recap = useWeekRecap()
  const { data: release, refetch } = useQuery({ queryKey: changelogKey, queryFn: getLatestChangelog, staleTime: Infinity, retry: false })

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch()
    })
    return () => sub.remove()
  }, [refetch])

  const recapBusy = recap.isPending || !!recap.data?.due
  useEffect(() => {
    if (!release || recapBusy) return
    if (release.version && isVersionNewer(release.version, appJson.expo.version)) return
    const key = `${currentUserId()}:${release.id}`
    if (attempted.has(key)) return
    attempted.add(key)
    claimChangelog(release.id)
      .then((claimed) => {
        qc.setQueryData(changelogKey, null)
        if (!claimed) return
        shown = claimed
        router.push('/whats-new')
      })
      // Not seen yet: the next app foreground retries.
      .catch(() => attempted.delete(key))
  }, [release, recapBusy, qc])
}
