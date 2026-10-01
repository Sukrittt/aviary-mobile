import { cancelHabitNudges, handleHabitResponse, refreshHabitNudges, setHabitNudgesEnabled, type NudgeData } from './habitNudges'
import { enqueue } from '@/src/lib/pendingExpenses'
import { flush } from '@/src/sync/flush'
import type { ExpenseRow } from '@/src/types'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }))
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }))
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => `uuid-${Math.random()}`) }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))
jest.mock('@/src/lib/currencyPreference', () => ({ readCurrencyPreference: () => Promise.resolve('INR') }))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: () => 'user-1', initAccessMode: jest.fn() }))
jest.mock('@/src/lib/pendingExpenses', () => ({ enqueue: jest.fn(() => Promise.resolve()) }))
jest.mock('@/src/sync/flush', () => ({ flush: jest.fn(() => Promise.resolve()) }))
const mockFetchCopy = jest.fn()
jest.mock('@/src/api/habitNudges', () => ({ fetchNudgeCopy: (...args: unknown[]) => mockFetchCopy(...args) }))

const mockStorage = new Map<string, unknown>()
jest.mock('@/src/lib/encryptedStorage', () => ({
  readEncrypted: (k: string) => Promise.resolve(mockStorage.get(k) ?? null),
  writeEncrypted: (k: string, v: unknown) => Promise.resolve(void mockStorage.set(k, v)),
}))

const mockScheduled: { identifier: string; content: { data?: Record<string, unknown> } }[] = []
const mockNotifications = {
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([...mockScheduled])),
  cancelScheduledNotificationAsync: jest.fn((id: string) => {
    mockScheduled.splice(mockScheduled.findIndex((n) => n.identifier === id), 1)
    return Promise.resolve()
  }),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  scheduleNotificationAsync: jest.fn((req: { identifier?: string; content: { data?: Record<string, unknown> } }) => {
    if (req.identifier) mockScheduled.push({ identifier: req.identifier, content: req.content })
    return Promise.resolve(req.identifier ?? 'x')
  }),
  dismissNotificationAsync: jest.fn(() => Promise.resolve()),
  registerTaskAsync: jest.fn(() => Promise.resolve()),
}
jest.mock('@/src/lib/notifications', () => ({ getNotifications: () => mockNotifications }))

const nudge: NudgeData = { nudgeId: 'n1', habitId: 'fun|football', item: 'Football', category: 'Fun', amountInr: 200, paymentMethod: 'bank' }
const response = (actionIdentifier: string, data: NudgeData = nudge) =>
  ({ actionIdentifier, notification: { request: { identifier: data.nudgeId, content: { data } } } }) as never

function footballRows(): ExpenseRow[] {
  // Mondays, 7pm, the four weeks before Thu 2026-10-01.
  return ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((date) => ({
    timestamp: `${date}T19:00:00+05:30`, date, item: 'Football', amount_inr: '200', category: 'Fun',
    notes: '', source: 'manual', amount: '200', description: '', payment_method: 'bank',
  }))
}

beforeEach(() => {
  jest.clearAllMocks()
  mockFetchCopy.mockResolvedValue(null)
  mockStorage.clear()
  mockScheduled.length = 0
})

describe('handleHabitResponse', () => {
  it('logs straight from the button, using the nudge id as client_id', async () => {
    await handleHabitResponse(response('log'))
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ item: 'Football', amount_inr: '200', category: 'Fun', client_id: 'n1' }), 'user-1')
    expect(flush).toHaveBeenCalled()
    expect(mockNotifications.dismissNotificationAsync).toHaveBeenCalledWith('n1')
  })

  it('logs once when the same tap arrives twice', async () => {
    const twice = { ...nudge, nudgeId: 'n2' }
    await Promise.all([handleHabitResponse(response('log', twice)), handleHabitResponse(response('log', twice))])
    expect(enqueue).toHaveBeenCalledTimes(1)
  })

  it('opens log-expense prefilled on a plain tap', async () => {
    await handleHabitResponse(response('expo.modules.notifications.actions.DEFAULT', { ...nudge, nudgeId: 'n3' }))
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/modals/log-expense',
      params: { item: 'Football', amountInr: '200', category: 'Fun', paymentMethod: 'bank' },
    })
    expect(enqueue).not.toHaveBeenCalled()
  })

  it('just dismisses on "Not this one"', async () => {
    await handleHabitResponse(response('skip', { ...nudge, nudgeId: 'n4' }))
    expect(enqueue).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
    expect(mockNotifications.dismissNotificationAsync).toHaveBeenCalledWith('n4')
  })
})

describe('refreshHabitNudges', () => {
  const now = new Date(2026, 9, 1, 9) // Thu 9am local

  it('schedules the coming Monday with the amount on the button', async () => {
    await refreshHabitNudges(footballRows(), now)
    expect(mockNotifications.setNotificationCategoryAsync).toHaveBeenCalledWith('habit-0', [
      expect.objectContaining({ identifier: 'log', buttonTitle: 'Log ₹200' }),
      expect.objectContaining({ identifier: 'skip' }),
    ])
    expect(mockScheduled).toHaveLength(1)
    const call = mockNotifications.scheduleNotificationAsync.mock.calls[0][0] as unknown as { content: { title: string }; trigger: { date: Date } }
    expect(call.content.title).toBe('Football time?')
    expect(call.trigger.date).toEqual(new Date(2026, 9, 5, 19, 15))
  })

  it('uses the AI copy once it arrives, and only asks once', async () => {
    mockFetchCopy.mockResolvedValue({ title: 'Football night?', bodies: ['Boots on? Log it before kickoff.'] })
    await refreshHabitNudges(footballRows(), now)
    await refreshHabitNudges(footballRows(), now)
    expect(mockFetchCopy).toHaveBeenCalledTimes(1)
    const last = mockNotifications.scheduleNotificationAsync.mock.calls.at(-1)![0] as unknown as { content: { title: string; body: string } }
    expect(last.content).toMatchObject({ title: 'Football night?', body: 'Boots on? Log it before kickoff.' })
  })

  it('waits a day before asking again after a failed fetch', async () => {
    await refreshHabitNudges(footballRows(), now)
    await refreshHabitNudges(footballRows(), new Date(now.getTime() + 60 * 60 * 1000))
    expect(mockFetchCopy).toHaveBeenCalledTimes(1)
    await refreshHabitNudges(footballRows(), new Date(now.getTime() + 25 * 60 * 60 * 1000))
    expect(mockFetchCopy).toHaveBeenCalledTimes(2)
  })

  it('replaces the old plan instead of stacking a second one', async () => {
    await refreshHabitNudges(footballRows(), now)
    await refreshHabitNudges(footballRows(), now)
    expect(mockScheduled).toHaveLength(1)
  })

  it('schedules nothing without notification permission', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' })
    await refreshHabitNudges(footballRows(), now)
    expect(mockScheduled).toHaveLength(0)
  })

  it('stops when switched off and leaves nothing behind', async () => {
    await refreshHabitNudges(footballRows(), now)
    await setHabitNudgesEnabled(false, footballRows())
    expect(mockScheduled).toHaveLength(0)
  })

  it('cancelHabitNudges leaves other scheduled notifications alone', async () => {
    mockScheduled.push({ identifier: 'other', content: { data: {} } })
    await refreshHabitNudges(footballRows(), now)
    await cancelHabitNudges()
    expect(mockScheduled.map((n) => n.identifier)).toEqual(['other'])
  })
})
