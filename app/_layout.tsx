import { useObserve,wrapRoot } from '@/src/lib/observe'
import { readCurrencyPreference } from '@/src/lib/currencyPreference'
import { CurrencyProvider } from '@/src/context/CurrencyProvider'
import { accessMode,clearAccess,initAccessMode } from '@/src/api/accessMode'
import { getUser, syncTimezone } from '@/src/api/account'
import { onOnboarded } from '@/src/api/onboardingSignal'
import { BirdLandingSplash } from '@/src/components/splash/BirdLandingSplash'
import { subscribeExchanging } from '@/src/api/useSignIn'
import { AlertHost } from '@/src/components/ui/AlertHost'
import { PrivacyProvider } from '@/src/context/PrivacyContext'
import { MaintenanceBanner } from '@/src/components/shared/MaintenanceBanner'
import { LogExpenseNavigation } from '@/src/features/log-expense/LogExpenseNavigation'
import { clearLogExpenseDraft } from '@/src/features/log-expense/draft'
import { LOG_EXPENSE_PATH,LogExpenseSubmitProvider } from '@/src/features/log-expense/SubmitContext'
import { identifyUser,initAnalytics,trackScreen } from '@/src/lib/analytics'
import { clearCategoryCache,readCategoryCache } from '@/src/lib/categoryCache'
import { clearGroupCache,readGroupCache } from '@/src/lib/groupCache'
import { initPurchases } from '@/src/lib/purchases'
import {
addNotificationResponseListener,addPushTokenListener,checkColdStartNotification,configureNotificationHandler,
registerForPushNotificationsAsync,unregisterDevicePushToken
} from '@/src/lib/notifications'
import { startAutoFlush } from '@/src/sync/flush'
import { cancelHabitNudges } from '@/src/lib/habitNudges'
import { useAppFonts } from '@/src/theme/fonts'
import { ThemeProvider,useTheme } from '@/src/theme/ThemeProvider'
import { clearSnapshot } from '@/src/widgets/snapshot'
import { WidgetSync, lockWidgets } from '@/src/widgets/WidgetSync'
import { useAccessAllowed } from '@/src/hooks/useBillingStatus'
import { onAiAllowanceExceeded } from '@/src/lib/aiAllowance'
import { QueryClient,QueryClientProvider } from '@tanstack/react-query'
import { setAudioModeAsync } from 'expo-audio'
import { Stack,useGlobalSearchParams,usePathname,useRouter,useSegments,type Href } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect,useRef,useState } from 'react'
import { StyleSheet,View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

SplashScreen.preventAutoHideAsync().catch(() => {})
configureNotificationHandler()
initAnalytics()
// Beside initAnalytics for the same reason: accessMode is the one choke point
// every sign-in path passes through, so the billing customer identity is
// bound there rather than at four separate call sites.
initPurchases()
// Default playsInSilentMode is false — success/delete sound effects would be
// silently muted whenever the iOS ring switch is off.
setAudioModeAsync({ playsInSilentMode: true }).catch(() => {})
startAutoFlush()

function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return /: 401\b/.test(message) || /: 403\b/.test(message)
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
})

/**
 * The nav is a sibling overlay above the whole root Stack, not scoped to
 * (tabs) or rendered per-screen: it must survive every push (log-expense
 * included) so its carousel can animate between active states instead of
 * unmounting/remounting and cutting. An absolutely-positioned child of the
 * navigator's tabBar slot (which has no height) is untouchable on Android,
 * hence a plain sibling rather than that slot.
 *
 * Auth routing is declarative (Stack.Protected), not a redirect effect: the
 * root layout has to render a navigator on its very first render, and any
 * imperative router call that lands before that mount is dropped by
 * expo-router and logs "state update on a component that hasn't mounted yet".
 * Guards keep the Stack mounted the whole time and just change which screens
 * exist.
 */
function RootNavigator({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { tokens, preference } = useTheme()
  const router = useRouter()
  const segments = useSegments()
  const pathname = usePathname()
  const { mode: authScreenMode } = useGlobalSearchParams<{ mode?: string }>()
  const [cachedCurrency, setCachedCurrency] = useState('INR')
  const [hasSession, setHasSession] = useState(false)
  const [authReady, setAuthReady] = useState(false)
  // null = not yet known (still loading, or signed out) — the guards below
  // hold on /loading rather than guessing, so a slow /api/user fetch can't
  // flash the wrong screen.
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  // Only the setup completion CTA enables this; restoring a session never does.
  const [justOnboarded, setJustOnboarded] = useState(false)

  useEffect(() => {
    initAccessMode().then((restored) => {
      setHasSession(restored !== null)
      setAuthReady(true)
      // Hydrate the offline category picker instantly from disk, after the
      // sign-in notification above has already cleared the query cache for
      // this boot — hydrating any earlier would just get wiped by that clear.
      // React Query revalidates in the background once online (staleTime
      // already 30s), so this is a fast first paint, not a stale-forever cache.
      if (restored) {
        readCategoryCache().then((cached) => cached && queryClient.setQueryData(['categories'], cached))
        readGroupCache().then((cached) => cached && queryClient.setQueryData(['groups'], cached))
      }
    })
    // The auth screens persist a session (real or guest) then let the guards
    // take over — without this, hasSession stayed stale until the next app
    // boot and the user sat on the sign-in screen.
    const unsubscribe = accessMode.subscribe((m) => {
      setCachedCurrency('INR')
      setHasSession(true)
      // Every cached query (brief, expenses, budgets, chat sessions...) is
      // keyed without a user id, so switching identity (guest <-> real,
      // or a different account) must drop it all or the new identity sees
      // the previous one's data until staleTime happens to expire.
      queryClient.clear()
      clearLogExpenseDraft()
      // Fire-and-forget: registration failures must never block app usage.
      if (m === 'real') registerForPushNotificationsAsync()
    })
    const unsubscribeLogout = accessMode.subscribeLogout(async (token) => {
      setHasSession(false)
      setJustOnboarded(false)
      queryClient.clear()
      clearLogExpenseDraft()
      // Otherwise the next account signed into on this device inherits the
      // previous one's budget numbers on the home screen (see PrivacyContext
      // for the same reasoning applied to the hide-amounts preference).
      // Offline expense queues stay: they're keyed by user id, so only that
      // account can sync them when it signs back in.
      await Promise.allSettled([clearSnapshot(), clearCategoryCache(), clearGroupCache(), unregisterDevicePushToken(token), cancelHabitNudges()])
    })
    return () => {
      unsubscribe()
      unsubscribeLogout()
    }
  }, [])

  // Fetch the onboarding flag once per sign-in. Fails open (treats a fetch
  // error as "onboarded") — a flaky /api/user must never trap the user in
  // an onboarding loop.
  useEffect(() => {
    if (!hasSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets stale onboarding state across an account switch, ahead of the async refetch below
      setOnboarded(null)
      return
    }
    let cancelled = false
    getUser()
      .then((u) => {
        if (cancelled) return
        queryClient.setQueryData(['user'], u)
        setOnboarded(!!u.onboardedAt)
        // Piggybacks on the fetch this effect already makes, rather than
        // costing analytics its own request. Best effort: the id was already
        // attached the moment the session appeared, so a failure here just
        // leaves the person un-named.
        identifyUser(u)
        void syncTimezone(u)
      })
      .catch(async () => {
        const currency = await readCurrencyPreference()
        if (!cancelled) { setCachedCurrency(currency); setOnboarded(true) }
      })
    return () => {
      cancelled = true
    }
  }, [hasSession])

  useEffect(
    () =>
      onOnboarded(() => {
        setJustOnboarded(true)
        setOnboarded(true)
      }),
    []
  )

  useEffect(() => {
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.query.state.status === 'error' && isAuthError(event.query.state.error)) {
        // Drop the dead token, don't just navigate away from it: a redirect
        // alone left it in SecureStore to fail the same way next boot.
        // clearAccess fires the logout subscribers, which flip hasSession.
        void clearAccess()
      }
    })
  }, [])

  const ready = fontsLoaded && authReady
  const resolving = !ready || (hasSession && onboarded === null)

  // Cold-start TTI for Expo Observe: fonts loaded and auth/onboarding resolved,
  // so the first real screen can paint. Once only — `resolving` re-raises on
  // sign-in, which isn't a launch.
  const { markInteractive } = useObserve()
  const markedInteractive = useRef(false)
  useEffect(() => {
    if (resolving || markedInteractive.current) return
    markedInteractive.current = true
    markInteractive()
  }, [resolving, markInteractive])
  const signedIn = !resolving && hasSession && onboarded === true
  // Subscription access. Unknown counts as allowed (see accessAllowed), so
  // this never holds a paying user on a lock screen while the status loads.
  const accessOk = useAccessAllowed(signedIn)

  useEffect(() => {
    if (signedIn && !accessOk) void lockWidgets(preference)
  }, [signedIn, accessOk, preference])

  // A chat or bill scan the server refused because this month's AI allowance
  // is spent. The screen is a modal over whatever the user was doing; a second
  // refusal while it is already up must not stack another on top.
  useEffect(() => {
    if (!signedIn) return
    return onAiAllowanceExceeded(() => {
      if (pathname !== '/modals/ai-allowance') router.push('/modals/ai-allowance' as Href)
    })
  }, [signedIn, pathname, router])

  // log-expense is the launch screen (declared first below). When /loading
  // (or /setup) unregisters, the stack is rebuilt with nothing underneath, so
  // a fade there shows the black root bg between two orange screens. Read off
  // the pathname, not a latch set in an effect: pathname still reads the old
  // route during the rebuild commit, so the landing gets 'none' while every
  // later push from a tab still fades.
  // The bird splash is an overlay above the Stack, not the /loading route's
  // content: swapping /loading for the landing screen is a native stack
  // operation, and for a few frames neither screen is painted, which showed
  // as a black flash. The overlay stays up until the landing screen reports
  // it has actually appeared (transitionEnd fires from native onAppear), so
  // the splash hands off straight to a painted screen. The timer is only a
  // fallback in case that event never arrives.
  const [splashUp, setSplashUp] = useState(true)
  // Google sign-in's token exchange. `resolving` is also in the overlay check so
  // the splash stays continuous when the exchange hands off to the session
  // resolve, before the effect below re-raises splashUp.
  const [exchanging, setExchanging] = useState(false)
  useEffect(() => subscribeExchanging(setExchanging), [])
  useEffect(() => {
    if (resolving) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-raises the overlay whenever the guards fall back to /loading (e.g. sign-in)
      setSplashUp(true)
      return
    }
    const timer = setTimeout(() => setSplashUp(false), 1500)
    return () => clearTimeout(timer)
  }, [resolving])

  const logExpenseAnimation = pathname === '/loading' || pathname === '/setup' ? 'none' : 'fade'

  // The native splash only covers the pre-JS gap: it hides as soon as fonts
  // are ready (the BirdLandingSplash overlay needs Fredoka to draw
  // its wordmark), not the whole auth/onboarding resolve. That's deliberate —
  // an earlier JS splash forced a 2s minimum plus a remote Lottie fetch on
  // every cold boot. The local bird animation fetches nothing; it fills
  // whatever remains of `resolving` and unmounts as soon as it flips false.
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {})
  }, [fontsLoaded])

  // The one transition the guards can't make: (auth)/email and (auth)/code stay
  // registered while signed in (see the comment on them below), so signing in
  // from those screens removes nothing and leaves the user sitting on them.
  // Safe as an imperative call now — the Stack is mounted from the first render,
  // and the destination's guard is computed in this same render.
  // The sign-in pushes also leave (auth)/email under /setup, so finishing setup
  // doesn't empty the stack onto the trial notice. It surfaces the auth screen
  // instead, and this effect has to finish the onboarding handoff explicitly.
  useEffect(() => {
    if (resolving || !hasSession) return
    if (segments[0] !== '(auth)' || authScreenMode === 'change-email') return
    router.replace((!onboarded ? '/setup' : justOnboarded ? '/account/trial-notice' : LOG_EXPENSE_PATH) as Href)
  }, [resolving, hasSession, onboarded, justOnboarded, segments, authScreenMode, router])

  // The Activity deep link only exists once the signed-in screens do, so a
  // notification that launched the app from killed has to wait for them.
  useEffect(() => {
    if (resolving || !hasSession || !onboarded) return
    checkColdStartNotification().catch((err) => console.warn('Cold-start notification check failed', err))
  }, [resolving, hasSession, onboarded])

  // Screen views, captured by hand: PostHog's screen autocapture needs
  // react-navigation v6 or lower, and expo-router 57 is on v7. usePathname()
  // has already stripped the group segments, so this reads as /envelopes,
  // /insights, /modals/log-expense and so on. The route params are
  // deliberately left off: that is where ids and amounts would leak in.
  useEffect(() => {
    // The synthetic placeholder route, mounted under the native splash on every
    // cold boot. Nobody navigates to it, so counting it as a screen view is just noise.
    if (pathname === '/loading') return
    trackScreen(pathname)
  }, [pathname])

  return (
    <CurrencyProvider enabled={hasSession} initialCurrency={cachedCurrency}><View style={[styles.root, { backgroundColor: tokens.bg }]}>
      {/* Declaration order is load-bearing. When a guard flips, React Navigation
          drops every route that just unregistered, and if that empties the
          stack it rebuilds it from the navigator's *first* registered screen
          (StackRouter.getStateForRouteNamesChange -> routeNames[0]). The
          initialRouteName prop can't do this job: the router is built once, on
          the first render, when only /loading exists. So every block below
          leads with the screen that state opens on. */}
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.bg } }}
        screenListeners={({ route }) => ({
          transitionEnd: (e) => {
            if (!resolving && route.name !== 'loading' && !e.data.closing) setSplashUp(false)
          },
        })}
      >
        <Stack.Protected guard={resolving}>
          {/* fade, not the Stack default: this is the screen the native splash
              hands off to, so a hard cut would show through as a flash. */}
          <Stack.Screen name="loading" options={{ animation: 'fade', contentStyle: { backgroundColor: '#F04E23' } }} />
        </Stack.Protected>

        <Stack.Protected guard={!resolving && !hasSession}>
          <Stack.Screen name="(auth)/welcome" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        </Stack.Protected>

        <Stack.Protected guard={!resolving && hasSession && onboarded === false}>
          <Stack.Screen name="setup" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && accessOk}>
          {/* Fresh setup lands on the trial notice, then Home. The tour now lives
              in Home's Get Started card so it happens on the user's schedule. */}
          {justOnboarded && <Stack.Screen name="account/trial-notice" options={{ presentation: 'card', animation: 'slide_from_right' }} />}
          {/* First for returning users: logging an expense is the app's primary verb, so
              it's where the app opens. Declared first, it's the route the stack
              rebuilds itself from when the loading screen unregisters, so the
              app lands on it directly with nothing underneath and Android back
              exits.
              card (not fullScreenModal): a real native modal presentation covers
              the whole window on iOS, hiding the persistent nav below it. */}
          <Stack.Screen name="modals/log-expense" options={{ presentation: 'card', animation: logExpenseAnimation, contentStyle: { backgroundColor: tokens.accent } }} />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="investments" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/notifications" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/features" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/archive" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/recurring" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/recurring-suggestions" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/bill-scans" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/guided-tour" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="insights" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="subscriptions" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="wrapped" options={{ presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="modals/expense-added" options={{ presentation: 'card', animation: 'fade' }} />
          <Stack.Screen name="modals/expense-failed" options={{ presentation: 'card', animation: 'fade' }} />
          <Stack.Screen name="modals/scan-bill" options={{ presentation: 'card', animation: 'fade' }} />
          <Stack.Screen name="modals/move-money" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/edit-assigned-amount" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/edit-ready-to-assign" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/edit-month-income" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/add-income" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/holding-action" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/add-holding" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/subscription" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/ai-allowance" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/recurring-expense" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/bill-scan" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/duplicates" options={{ presentation: 'modal' }} />
          <Stack.Screen name="modals/money-brain" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="modals/widget-preview" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        </Stack.Protected>

        {/* Reachable with or without subscription access: billing, and the exits
            payment-subscriptions-plan.md promises an expired account (export,
            account deletion, help). When access is lost the block above
            unregisters, so account/plan, first here, is what the stack rebuilds
            from, with nothing underneath to go back to. */}
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="account/plan" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/security" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/data" options={{ presentation: 'card', animation: 'slide_from_right' }} />
          <Stack.Screen name="account/help" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        </Stack.Protected>

        {/* Ungated: these are reached both signed out (from welcome) and signed
            in (the change-email flow from Account & security). A guard can't
            read the `mode` param that distinguishes them — that param only
            exists after the navigation the guard would have to allow first.
            Declared last so they're never the fallback route above. */}
        <Stack.Screen name="(auth)/email" options={{ presentation: 'card', animation: 'slide_from_right' }} />
        <Stack.Screen name="(auth)/code" options={{ presentation: 'card', animation: 'slide_from_right' }} />
      </Stack>
      <LogExpenseNavigation />
      {splashUp ? null : <MaintenanceBanner />}
      {splashUp || resolving || exchanging ? <View style={StyleSheet.absoluteFill}><BirdLandingSplash /></View> : null}
      <AlertHost />
      {/* Same gate as the (tabs) Stack.Protected block above: fires the same
          budgets/expenses queries those screens already fetch, so it must only
          run once they're reachable — not on every cold boot regardless of
          auth state. */}
      {signedIn && accessOk ? <WidgetSync /> : null}
    </View></CurrencyProvider>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
})

function RootLayout() {
  const [fontsLoaded] = useAppFonts()

  useEffect(() => {
    const tokenSub = addPushTokenListener()
    const responseSub = addNotificationResponseListener()
    return () => {
      tokenSub?.remove()
      responseSub?.remove()
    }
  }, [])

  // No early `return null` while the fonts load: the native splash is still up
  // (preventAutoHideAsync above, hidden by RootNavigator once fonts are ready), and a
  // render without a navigator is exactly what breaks expo-router.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <PrivacyProvider><LogExpenseSubmitProvider>
              <RootNavigator fontsLoaded={fontsLoaded} />
            </LogExpenseSubmitProvider></PrivacyProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}

export default wrapRoot(RootLayout)
