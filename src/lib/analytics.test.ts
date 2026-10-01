import { accessMode, currentUserId, type AccessMode } from '../api/accessMode'
import { Platform } from 'react-native'
import { flushAnalytics, identifyUser, initAnalytics, isAnalyticsEnabled, posthog, setAnalyticsEnabled, setEventContext, startTimer, track, trackFirst } from './analytics'

jest.mock('../api/accessMode', () => ({
  accessMode: { subscribe: jest.fn(), subscribeLogout: jest.fn() },
  currentUserId: jest.fn(),
}))

const mockSubscribe = accessMode.subscribe as jest.Mock
const mockSubscribeLogout = accessMode.subscribeLogout as jest.Mock
const mockCurrentUserId = currentUserId as jest.MockedFunction<typeof currentUserId>

function notifyMode(mode: AccessMode): void {
  ;(mockSubscribe.mock.calls[0][0] as (m: AccessMode) => void)(mode)
}

function notifyLogout(): void {
  ;(mockSubscribeLogout.mock.calls[0][0] as () => void)()
}

beforeEach(() => {
  jest.clearAllMocks()
  initAnalytics()
})

describe('initAnalytics', () => {
  it('identifies with the WorkOS user id when a real session appears', () => {
    mockCurrentUserId.mockReturnValue('user_01ABC')
    notifyMode('real')
    expect(posthog.identify).toHaveBeenCalledWith('user_01ABC')
  })

  it('sends no properties alongside the id, so no email or name can leak', () => {
    mockCurrentUserId.mockReturnValue('user_01ABC')
    notifyMode('real')
    expect(posthog.identify).toHaveBeenCalledTimes(1)
    expect((posthog.identify as jest.Mock).mock.calls[0]).toHaveLength(1)
  })

  it('leaves guest sessions anonymous', () => {
    mockCurrentUserId.mockReturnValue(null)
    notifyMode('guest')
    expect(posthog.identify).not.toHaveBeenCalled()
  })

  // clearAccess() notifies subscribers with 'guest' before it runs the logout
  // subscribers, so the mode guard is what stops an identify(null) landing
  // between the two.
  it('does not identify on the guest notification that precedes a logout', () => {
    mockCurrentUserId.mockReturnValue(null)
    notifyMode('guest')
    notifyLogout()
    expect(posthog.identify).not.toHaveBeenCalled()
    expect(posthog.reset).toHaveBeenCalled()
  })

  it('resets on logout, so the next account on the device starts clean', () => {
    notifyLogout()
    expect(posthog.reset).toHaveBeenCalledTimes(1)
  })
})

describe('identifyUser', () => {
  it('attaches name and email to the person under the same distinct id', () => {
    mockCurrentUserId.mockReturnValue('user_01ABC')
    identifyUser({ email: 'a@b.com', name: 'Ada' })
    expect(posthog.identify).toHaveBeenCalledWith('user_01ABC', { email: 'a@b.com', name: 'Ada' })
  })

  // A null name is what the API returns for an account that never set one.
  // Sending null would write a literal null onto the person record.
  it('drops a null name rather than writing it to the person', () => {
    mockCurrentUserId.mockReturnValue('user_01ABC')
    identifyUser({ email: 'a@b.com', name: null })
    expect(posthog.identify).toHaveBeenCalledWith('user_01ABC', { email: 'a@b.com' })
  })

  it('does nothing when there is no session to attach the profile to', () => {
    mockCurrentUserId.mockReturnValue(null)
    identifyUser({ email: 'a@b.com', name: 'Ada' })
    expect(posthog.identify).not.toHaveBeenCalled()
  })
})

describe('analytics opt-out', () => {
  afterEach(() => {
    ;(posthog as unknown as { optedOut: boolean }).optedOut = false
  })

  it('reads enabled state off the SDK\'s own optedOut flag', () => {
    ;(posthog as unknown as { optedOut: boolean }).optedOut = true
    expect(isAnalyticsEnabled()).toBe(false)
    ;(posthog as unknown as { optedOut: boolean }).optedOut = false
    expect(isAnalyticsEnabled()).toBe(true)
  })

  it('calls optOut() when turned off', async () => {
    await setAnalyticsEnabled(false)
    expect(posthog.optOut).toHaveBeenCalledTimes(1)
    expect(posthog.optIn).not.toHaveBeenCalled()
  })

  it('calls optIn() when turned on', async () => {
    await setAnalyticsEnabled(true)
    expect(posthog.optIn).toHaveBeenCalledTimes(1)
    expect(posthog.optOut).not.toHaveBeenCalled()
  })
})

describe('track', () => {
  it('forwards the event and its properties to capture', () => {
    track('expense_logged', { category: 'Groceries', payment_method: 'bank' })
    expect(posthog.capture).toHaveBeenCalledWith('expense_logged', {
      category: 'Groceries',
      payment_method: 'bank',
    })
  })
})

describe('trackFirst', () => {
  it('stamps the person property through $set_once on the same event', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T08:00:00.000Z'))
    trackFirst('expense_logged', 'first_expense_at', { payment_method: 'bank' })
    expect(posthog.capture).toHaveBeenCalledWith('expense_logged', {
      payment_method: 'bank',
      $set_once: { first_expense_at: '2026-09-29T08:00:00.000Z' },
    })
    jest.useRealTimers()
  })
})

describe('event context', () => {
  it('registers the platform on init, so web and mobile split in one project', () => {
    expect(posthog.register).toHaveBeenCalledWith({ platform: Platform.OS })
  })

  it('registers context properties for every later event', () => {
    setEventContext({ plan_status: 'trial' })
    expect(posthog.register).toHaveBeenCalledWith({ plan_status: 'trial' })
  })
})

describe('startTimer', () => {
  it('reads whole seconds since it started', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-29T08:00:00.000Z'))
    const elapsed = startTimer()
    jest.setSystemTime(new Date('2026-09-29T08:00:41.600Z'))
    expect(elapsed()).toBe(42)
    jest.useRealTimers()
  })
})

describe('flushAnalytics', () => {
  it('sends the queue and swallows a failure', async () => {
    ;(posthog.flush as jest.Mock).mockRejectedValueOnce(new Error('offline'))
    await expect(flushAnalytics()).resolves.toBeUndefined()
    expect(posthog.flush).toHaveBeenCalled()
  })
})

describe('environment gate', () => {
  // Loads a fresh copy of the module with a given build mode and EAS channel.
  function loadWith(dev: boolean, channel: string | null): boolean {
    const g = globalThis as unknown as { __DEV__: boolean }
    const prevDev = g.__DEV__
    g.__DEV__ = dev
    let disabled = true
    jest.isolateModules(() => {
      jest.doMock('expo-updates', () => ({ channel }))
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      disabled = (require('./analytics') as typeof import('./analytics')).analyticsDisabled
    })
    g.__DEV__ = prevDev
    return disabled
  }

  it('sends only from a release build on the production channel', () => {
    expect(loadWith(false, 'production')).toBe(false)
    expect(loadWith(false, 'preview')).toBe(true)
    expect(loadWith(false, null)).toBe(true)
    expect(loadWith(true, 'production')).toBe(true)
  })
})
