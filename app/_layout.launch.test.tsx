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

// New users (no manual expense yet) get (tabs) declared ahead of log-expense,
// so the same rebuild rule opens them on Home instead.
it('opens on Home when it is declared ahead of log-expense', async () => {
  function NewUserLayout() {
    const [resolving, setResolving] = useState(true)
    const landOnHome = true
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
          {landOnHome && <Stack.Screen name="index" />}
          <Stack.Screen name="modals/log-expense" />
          {!landOnHome && <Stack.Screen name="index" />}
        </Stack.Protected>
      </Stack>
    )
  }
  renderRouter(
    {
      _layout: NewUserLayout,
      loading: () => <Text>loading</Text>,
      'modals/log-expense': () => <Text>log expense</Text>,
      index: () => <Text>home</Text>,
    },
    { initialUrl: '/' }
  )

  await waitFor(() => expect(screen.getByText('home')).toBeTruthy())
  expect(screen.queryByText('log expense')).toBeNull()
  expect(testRouter.canGoBack()).toBe(false)
})

// Signing in from (auth)/email pushes /code on top. The handoff dismisses both
// before replacing, so finishing setup never empties the stack onto them.
it('never shows the sign-in screens again once setup finishes', async () => {
  function SignInLayout() {
    const [signedIn, setSignedIn] = useState(false)
    const [onboarded, setOnboarded] = useState(false)
    const router = useRouter()
    useEffect(() => onOnboarded(() => setOnboarded(true)), [])
    useEffect(() => {
      if (!signedIn) return
      if (router.canDismiss()) router.dismissAll()
      router.replace('/setup')
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signedIn])
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="setup" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="account/trial-notice" />
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Screen name="email" />
        <Stack.Screen name="code" />
        {/* Sign-in flips this from the code screen. */}
        <Stack.Screen name="signin" listeners={{ focus: () => setSignedIn(true) }} />
      </Stack>
    )
  }
  renderRouter({
    _layout: SignInLayout,
    email: function Email() {
      const router = useRouter()
      return <Button title="Send code" onPress={() => router.push('/code')} />
    },
    code: function Code() {
      const router = useRouter()
      return <Button title="Verify" onPress={() => router.push('/signin')} />
    },
    signin: () => <Text>signing in</Text>,
    setup: () => <Button title="Continue" onPress={signalOnboarded} />,
    'account/trial-notice': () => <Text>trial notice</Text>,
    index: () => <Text>home</Text>,
  }, { initialUrl: '/email' })

  fireEvent.press(screen.getByText('Send code'))
  fireEvent.press(await screen.findByText('Verify'))
  fireEvent.press(await screen.findByText('Continue'))

  await waitFor(() => expect(screen.getByText('trial notice')).toBeTruthy())
  expect(screen.queryByText('Send code')).toBeNull()
  expect(testRouter.canGoBack()).toBe(false)
})
