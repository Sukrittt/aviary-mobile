import { FloatingNav, NAV_HREF, navStateFor } from '@/src/components/nav/FloatingNav'
import { TabBar } from '@/src/components/nav/TabBar'
import { usePathname, useRouter } from 'expo-router'
import { useCachedUser } from '@/src/hooks/useUser'
import { isHidden } from '@/src/lib/features'
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

  return (
    <TabBar visible={visible} overrideContent={
      <FloatingNav
        active={active}
        addActive={addActive}
        addSaving={addActive && submitState.saving}
        addSuccess={addActive && submitState.success}
        addInvalid={addActive && addInvalid}
        addDisabled={addActive && addDisabled}
        addHint={addHint}
        onSelect={(name) => (addActive ? router.replace(NAV_HREF[name]) : router.navigate(NAV_HREF[name]))}
        onAdd={() => (addActive ? submitState.submit() : router.push(LOG_EXPENSE_PATH))}
        onAddInvalid={submitState.onInvalid}
        onAddLongPress={isHidden(user, 'billScan') ? undefined : () => router.push('/modals/scan-bill')}
      />
    } />
  )
}
