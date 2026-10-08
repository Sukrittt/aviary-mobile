import { Tabs } from 'expo-router/js-tabs'
import { useNavigation, usePathname } from 'expo-router'
import { useEffect, useLayoutEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { FloatingNav, NavBackdrop, activeRouteFor, nextNavCover, type NavCover } from '@/src/components/nav/FloatingNav'
import { tabsNavCover } from '@/src/components/nav/TabBar'
import { LOG_EXPENSE_PATH } from '@/src/features/log-expense/SubmitContext'
import { useTheme } from '@/src/theme/ThemeProvider'
import { useHabitNudges } from '@/src/hooks/useHabitNudges'
import { useWeekRecapGate } from '@/src/features/week-recap/useWeekRecap'
import { useChangelogGate } from '@/src/features/changelog/useChangelogGate'

const noop = () => {}

/**
 * The nav as this screen's own content, shown only while the tabs slide out
 * under a pushed screen or back in on pop. The real nav is a root overlay
 * keyed on the pathname, which flips at the *start* of a stack transition, so
 * on its own it faded in place over the moving screens. This copy moves with
 * the screen instead, and masks the overlay until the pop has settled.
 */
function TabsNavStandIn() {
  const pathname = usePathname()
  const navigation = useNavigation()
  const [cover, setCover] = useState<NavCover>(() => ({ path: pathname, tab: activeRouteFor(pathname) ?? 'index', covered: false, arriving: false }))
  const next = nextNavCover(cover, pathname, pathname === LOG_EXPENSE_PATH)
  if (next !== cover) setCover(next)
  // Signing out flips the pathname to /welcome just like a push would, but the
  // guards drop the tabs from the stack, and this screen animates out on top
  // of welcome. Only stand in while the tabs are still in the stack.
  const inStack = navigation.getState()?.routes.some((r) => r.name === '(tabs)') ?? false
  const shown = inStack && (next.covered || next.arriving)

  // Layout effect, not a passive one: the overlay has to drop out in the same
  // frame this copy appears, or both show (or neither) for a frame.
  useLayoutEffect(() => {
    tabsNavCover.value = shown ? 1 : 0
  }, [shown])
  // Unmounting while covered (signed out from a pushed screen) must not leave
  // the overlay masked for the next session.
  useLayoutEffect(() => () => {
    tabsNavCover.value = 0
  }, [])

  useEffect(() => {
    if (!next.arriving) return
    const settle = () => setCover((c) => ({ ...c, arriving: false }))
    const unsubscribe = navigation.addListener('transitionEnd' as never, (e: { data?: { closing?: boolean } }) => {
      if (!e.data?.closing) settle()
    })
    // ponytail: fallback in case a presentation never reports transitionEnd
    // for the screen underneath; longer than any stack animation here.
    const timer = setTimeout(settle, 700)
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [next.arriving, navigation])

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: shown ? 1 : 0 }]}>
      <FloatingNav active={next.tab} onSelect={noop} onAdd={noop} />
    </View>
  )
}

export default function TabsLayout() {
  const { tokens } = useTheme()
  useHabitNudges()
  useWeekRecapGate()
  useChangelogGate()

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={() => null}
        screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: tokens.bg } }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="activity" />
        <Tabs.Screen name="envelopes" />
        <Tabs.Screen name="more" />
      </Tabs>
      <NavBackdrop />
      <TabsNavStandIn />
    </View>
  )
}
