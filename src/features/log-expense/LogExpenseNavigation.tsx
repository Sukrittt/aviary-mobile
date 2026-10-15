import { FloatingNav, NAV_HREF, NAV_SLIDE_MS, navStateFor, type NavRoute } from '@/src/components/nav/FloatingNav'
import { TabBar } from '@/src/components/nav/TabBar'
import { QuickAddMenu, type QuickAddItem } from '@/src/components/nav/QuickAddMenu'
import { useTheme } from '@/src/theme/ThemeProvider'
import { INCOME_FLOOD } from '@/src/theme/tokens'
import { usePathname, useRouter } from 'expo-router'
import { HandCoins, Plus, Scan } from '@/src/components/shared/icons'
import { useEffect, useRef, useState } from 'react'
import { useCachedUser } from '@/src/hooks/useUser'
import { isHidden } from '@/src/lib/features'
import { QUICK_INCOME_PATH } from './IncomeFloodButton'
import { LOG_EXPENSE_PATH, useLogExpenseSubmitState } from './SubmitContext'

/**
 * The app's single nav instance, mounted once above the root Stack (see
 * app/_layout.tsx) so it survives every push — including log-expense —
 * instead of unmounting/remounting and cutting between states. Nav state
 * (which slot is active, whether the nav shows at all) is derived purely
 * from the pathname via navStateFor.
 */
export function LogExpenseNavigation() {
  const router = useRouter()
  const pathname = usePathname()
  const { active, addActive, visible } = navStateFor(pathname, pathname === LOG_EXPENSE_PATH)
  const submitState = useLogExpenseSubmitState()
  const addInvalid = !submitState.canSubmit
  const addDisabled = submitState.saving || submitState.success
  // Cache-only read: this nav mounts before sign-in, so it must never fetch the profile itself.
  const user = useCachedUser()
  // First expense ever, form ready: point at + as the save button, which
  // otherwise only reads as "go to log expense". Gone once the save lands.
  const addHint = addActive && !addInvalid && !addDisabled && !!user && !user.manualTransactionCompletedAt
  const { tokens } = useTheme()
  // Remembers where it opened, so any navigation (back gesture, deep link) closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null)
  const closeMenu = () => setMenuPath(null)
  // Cleared during render rather than just hidden, so coming back to that path doesn't reopen it.
  if (menuPath !== null && menuPath !== pathname) setMenuPath(null)
  // The tab just tapped, lit before the navigation lands. `active` comes from
  // the pathname, which only changes once the new tab has rendered (a lazy
  // first mount is the slow case), so without this the nav sat stale for that
  // whole render. Dropped as soon as the pathname moves on.
  const [pendingTab, setPendingTab] = useState<{ from: string; tab: NavRoute } | null>(null)
  if (pendingTab !== null && pendingTab.from !== pathname) setPendingTab(null)
  const navTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Anything else that moves the route during the slide (back gesture, +)
  // wins: the pending tab switch is dropped rather than landing late.
  useEffect(() => () => clearTimeout(navTimer.current), [pathname])
  const selectTab = (name: NavRoute) => {
    // Log-expense swaps itself out with replace and its nav morphs in place, so it keeps the old path.
    if (addActive) return router.replace(NAV_HREF[name])
    setPendingTab({ from: pathname, tab: name })
    // Navigate once the highlight has landed. Mounting a heavy tab blocks the
    // UI thread on Android too, so navigating any sooner froze the slide
    // halfway. A second quick tap replaces the first.
    clearTimeout(navTimer.current)
    navTimer.current = setTimeout(() => router.navigate(NAV_HREF[name]), NAV_SLIDE_MS)
  }
  const menuItems: QuickAddItem[] = [
    { label: 'Log expense', icon: Plus, tint: tokens.accent, onPress: () => router.push(LOG_EXPENSE_PATH) },
    ...(isHidden(user, 'billScan') ? [] : [{ label: 'Scan a bill', icon: Scan, tint: tokens.blue, onPress: () => router.navigate({ pathname: '/more', params: { scan: '1' } }) }]),
    ...(isHidden(user, 'income') ? [] : [{ label: 'Add income', icon: HandCoins, tint: INCOME_FLOOD, onPress: () => router.push(QUICK_INCOME_PATH) }]),
  ]

  return (
    <TabBar visible={visible} overrideContent={<>
      <FloatingNav
        active={pendingTab?.tab ?? active}
        addActive={addActive}
        addSaving={addActive && submitState.saving}
        addSuccess={addActive && submitState.success}
        addInvalid={addActive && addInvalid}
        addDisabled={addActive && addDisabled}
        addHint={addHint}
        onSelect={selectTab}
        onAdd={() => (addActive ? submitState.submit() : router.push(LOG_EXPENSE_PATH))}
        onAddInvalid={submitState.onInvalid}
        onAddLongPress={() => setMenuPath(pathname)}
      />
      {menuPath === pathname && visible && <QuickAddMenu items={menuItems} onClose={closeMenu} />}
    </>} />
  )
}
