import { onOnboarded, signalOnboarded } from '@/src/api/onboardingSignal'
import { Stack, useRouter } from 'expo-router'
import { renderRouter, screen, testRouter, waitFor, fireEvent } from 'expo-router/testing-library'
import { useEffect, useState } from 'react'
import { Text, Button } from 'react-native'

// app/_layout.tsx opens on log-expense purely by declaring it first inside the
// signed-in guard: when /loading unregisters, React Navigation rebuilds the
// emptied stack from routeNames[0] (StackRouter.getStateForRouteNamesChange).
// This pins that behaviour against the real expo-router/react-navigation
// stack — app/_layout.test.tsx mocks expo-router away, so it can't catch a
// version upgrade that changes the fallback rule.
function Layout() {
  const [resolving, setResolving] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setResolving(false), 0)
    return () => clearTimeout(id)
  }, [])
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={resolving}>
        <Stack.Screen name="loading" />
      </Stack.Protected>
      <Stack.Protected guard={!resolving}>
        <Stack.Screen name="modals/log-expense" />
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  )
}

it('rebuilds the emptied stack from the first registered screen', async () => {
  renderRouter(
    {
      _layout: Layout,
      loading: () => <Text>loading</Text>,
      'modals/log-expense': () => <Text>log expense</Text>,
      index: () => <Text>home</Text>,
    },
    { initialUrl: '/' } // native always boots with the root URL, never null
  )

  await waitFor(() => expect(screen.getByText('log expense')).toBeTruthy())
  expect(screen.queryByText('home')).toBeNull()
  expect(testRouter.canGoBack()).toBe(false)
})

function OnboardingLayout() {
  const [onboarded, setOnboarded] = useState(false)
  useEffect(() => onOnboarded(() => setOnboarded(true)), [])
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!onboarded}>
        <Stack.Screen name="setup" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="account/trial-notice" />
        <Stack.Screen name="modals/log-expense" />
        <Stack.Screen name="index" />
      </Stack.Protected>
    </Stack>
  )
}

it('replaces setup with the trial notice, then exits to Home without returning to setup', async () => {
  function TrialNotice() {
    const router = useRouter()
    return <Button title="Got it" onPress={() => router.replace('/')} />
  }
  renderRouter({
    _layout: OnboardingLayout,
    setup: () => <Button title="Continue" onPress={signalOnboarded} />,
    'account/trial-notice': TrialNotice,
    'modals/log-expense': () => <Text>log expense</Text>,
    index: () => <Text>home</Text>,
  }, { initialUrl: '/setup' })
  fireEvent.press(screen.getByText('Continue'))
  await waitFor(() => expect(screen.getByText('Got it')).toBeTruthy())
  expect(testRouter.canGoBack()).toBe(false)
  fireEvent.press(screen.getByText('Got it'))
  await waitFor(() => expect(screen.getByText('home')).toBeTruthy())
  expect(testRouter.canGoBack()).toBe(false)
})
