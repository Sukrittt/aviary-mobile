import { FloatingNav, NAV_HREF, navStateFor, tabsState, type NavRoute } from '@/src/components/nav/FloatingNav'
import { TabBar } from '@/src/components/nav/TabBar'
import { QuickAddMenu, type QuickAddItem } from '@/src/components/nav/QuickAddMenu'
import { useTheme } from '@/src/theme/ThemeProvider'
import { useNavigationContainerRef, usePathname, useRouter } from 'expo-router'
import { HandCoins, Plus, Scan, UploadSimple } from '@/src/components/shared/icons'
import { useState } from 'react'
import { useCachedUser } from '@/src/hooks/useUser'
import { isHidden } from '@/src/lib/features'
import { QUICK_INCOME_PATH } from './IncomeFloodButton'
import { EMPTY_SUBMIT, LOG_EXPENSE_PATH, useLogExpenseSubmitState } from './SubmitContext'

/**
 * The app's single nav instance, mounted once above the root Stack (see
 * app/_layout.tsx) so it survives every push — including log-expense —
 * instead of unmounting/remounting and cutting between states. Nav state
 * (which slot is active, whether the nav shows at all) is derived purely
 * from the pathname via navStateFor.
 */
export function LogExpenseNavigation() {
  const router = useRouter()
  const navigationRef = useNavigationContainerRef()
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
  // The nav wears log-expense's look only while its flood is on screen, so it
  // changes in the same frame the screen does. Off the pathname alone, it went
  // tone-on-tone a few frames before the flood arrived and stayed that way up
  // to half a second after it left: a white pill and disc on a white screen.
  // In: once log-expense has mounted and said so. Out: in the same commit as
  // the navigation away, via `leaving`.
  const [leaving, setLeaving] = useState<string | null>(null)
  if (leaving !== null && leaving !== pathname) setLeaving(null)
  const floodNav = addActive && submitState !== EMPTY_SUBMIT && leaving !== pathname
  const selectTab = (name: NavRoute) => {
    setPendingTab({ from: pathname, tab: name })
    if (addActive) {
      setLeaving(pathname)
      // Back to the tabs underneath log-expense, on this one. replace() stacked
      // a whole new copy of the tabs over the old ones on every trip, each one
      // mounting all four screens again: a blank Home while it rendered.
      return router.dismissTo(NAV_HREF[name])
    }
    // Straight to the tab by route name, on touch-down. router.navigate(href)
    // parsed the path and handed the tab fresh params, which re-rendered the
    // whole screen being shown: a few hundred ms before the switch painted.
    // In the same commit as the lit tab, so the glyph and the screen change in
    // one frame and the highlight slides after them (stepped by frame, see
    // TabPill). Lighting the tab a frame first put the screen's attach stall
    // in the middle of the slide, which froze it halfway.
    const tabs = tabsState(navigationRef.getRootState())
    if (tabs) navigationRef.dispatch({ type: 'JUMP_TO', payload: { name }, target: tabs.key })
    else router.navigate(NAV_HREF[name])
  }
  const menuItems: QuickAddItem[] = [
    { label: 'Log expense', icon: Plus, tint: tokens.accent, tintSoft: tokens.accentSoft, onPress: () => router.push(LOG_EXPENSE_PATH) },
    { label: 'Add from statement', icon: UploadSimple, tint: tokens.violet, tintSoft: tokens.violetSoft, onPress: () => router.push('/modals/statement') },
    ...(isHidden(user, 'billScan') ? [] : [{ label: 'Scan a bill', icon: Scan, tint: tokens.blue, tintSoft: tokens.blueSoft, onPress: () => router.navigate({ pathname: '/more', params: { scan: '1' } }) }]),
    ...(isHidden(user, 'income') ? [] : [{ label: 'Add income', icon: HandCoins, tint: tokens.mint, tintSoft: tokens.mintSoft, onPress: () => router.push(QUICK_INCOME_PATH) }]),
  ]

  return (
    <TabBar visible={visible} overrideContent={<>
      <FloatingNav
        active={pendingTab?.tab ?? active}
        addActive={floodNav}
        addSaving={floodNav && submitState.saving}
        addSuccess={floodNav && submitState.success}
        addInvalid={floodNav && addInvalid}
        addDisabled={floodNav && addDisabled}
        addHint={floodNav && addHint}
        onSelect={selectTab}
        onAdd={() => (addActive ? submitState.submit() : router.push(LOG_EXPENSE_PATH))}
        onAddInvalid={submitState.onInvalid}
        onAddLongPress={() => setMenuPath(pathname)}
      />
      {menuPath === pathname && visible && <QuickAddMenu items={menuItems} onClose={closeMenu} />}
    </>} />
  )
}
