import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, type Href } from 'expo-router'
import { currentUserId } from '@/src/api/accessMode'
import { useBudgetList } from '@/src/hooks/useBudgetSpaces'
import { activeBudgetId } from '@/src/lib/activeBudget'
import { onBudgetAccess } from '@/src/lib/budgetAccess'
import { switchBudget } from '@/src/lib/budgetSwitch'
import { alertReadOnly, fallbackBudgetId, handleLostBudget } from '@/src/lib/budgetMembership'
import { setNotificationBudgetSwitch } from '@/src/lib/notifications'
import { onPendingJoinCode, takePendingJoinCode } from '@/src/lib/pendingJoin'
import type { BudgetList } from '@/src/api/spaces'

/**
 * Mounted once while signed in. Turns the API's budget refusals into words
 * and a switch, opens the budget a push was about before routing to it, and
 * lands someone whose saved budget isn't theirs (or who has no personal one)
 * in the budget the server picked.
 */
export function BudgetAccessWatcher() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { data, isFetchedAfterMount } = useBudgetList()

  useEffect(
    () =>
      onBudgetAccess((event) => {
        const uid = currentUserId()
        if (event.kind === 'read_only') {
          const list = queryClient.getQueryData<BudgetList>(['spaces'])
          alertReadOnly(list?.budgets.find((b) => b.id === (activeBudgetId() ?? uid)))
        } else if (uid) void handleLostBudget(queryClient, uid, event.spaceId)
      }),
    [queryClient],
  )

  useEffect(() => {
    setNotificationBudgetSwitch(async (spaceId) => {
      const uid = currentUserId()
      if (uid) await switchBudget(queryClient, uid, spaceId)
    })
    return () => setNotificationBudgetSwitch(null)
  }, [queryClient])

  // An invite link, now or from before sign-in.
  useEffect(() => {
    const open = () => {
      const code = takePendingJoinCode()
      if (code) router.push(`/modals/join-budget?code=${code}` as Href)
    }
    open()
    return onPendingJoinCode(open)
  }, [router])

  // Only on a fresh list: the one restored from disk can predate a join.
  useEffect(() => {
    const uid = currentUserId()
    if (!isFetchedAfterMount || !uid || !data?.budgets.length) return
    const stored = activeBudgetId()
    if (data.budgets.some((b) => b.id === (stored ?? uid))) return
    if (stored) void handleLostBudget(queryClient, uid, stored)
    else void switchBudget(queryClient, uid, fallbackBudgetId(data, null))
  }, [data, isFetchedAfterMount, queryClient])

  return null
}
