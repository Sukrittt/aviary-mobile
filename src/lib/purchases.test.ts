import Purchases from 'react-native-purchases'
import type { PurchasesPackage } from 'react-native-purchases'
import { currentUserId } from '../api/accessMode'
import { syncBilling } from '../api/billing'
import { track } from './analytics'
import { purchase, restore } from './purchases'

jest.mock('./analytics', () => ({ track: jest.fn() }))
jest.mock('../api/billing', () => ({ syncBilling: jest.fn() }))
jest.mock('../api/accessMode', () => ({
  accessMode: { subscribe: jest.fn(), subscribeLogout: jest.fn() },
  currentUserId: jest.fn(),
}))

const pkg = { identifier: '$rc_monthly' } as PurchasesPackage
const mockPurchase = Purchases.purchasePackage as jest.Mock
const mockSync = syncBilling as jest.Mock
const mockTrack = track as jest.Mock
const mockUserId = currentUserId as jest.Mock
const mockAppUserId = Purchases.getAppUserID as jest.Mock
const mockLogIn = Purchases.logIn as jest.Mock
const mockRestore = Purchases.restorePurchases as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  // Signed in, and the SDK already knows it: the normal case.
  mockUserId.mockReturnValue('user_123')
  mockAppUserId.mockResolvedValue('user_123')
})

describe('purchase analytics', () => {
  it('reports a verified purchase', async () => {
    mockSync.mockResolvedValueOnce({ allowed: true, mode: 'paid' })
    await purchase(pkg)
    expect(mockTrack.mock.calls).toEqual([
      ['purchase_started', { package: '$rc_monthly' }],
      ['purchase_completed', { package: '$rc_monthly', verified: true, pending: false }],
    ])
  })

  it('reports a cancel as a cancel, not a failure', async () => {
    mockPurchase.mockRejectedValueOnce({ code: '1' })
    await expect(purchase(pkg)).resolves.toEqual({ status: 'cancelled' })
    expect(mockTrack).toHaveBeenLastCalledWith('purchase_cancelled', { package: '$rc_monthly' })
  })

  it('reports a slow payment as a pending completion', async () => {
    mockPurchase.mockRejectedValueOnce({ code: '20' })
    await purchase(pkg)
    expect(mockTrack).toHaveBeenLastCalledWith('purchase_completed', { package: '$rc_monthly', verified: false, pending: true })
  })

  it('reports a store error with its code and never its message', async () => {
    mockPurchase.mockRejectedValueOnce({ code: '5', message: 'Billing unavailable for user@example.com' })
    await purchase(pkg)
    expect(mockTrack).toHaveBeenLastCalledWith('purchase_failed', { package: '$rc_monthly', error_code: '5' })
  })

  it('reports a paid-but-unconfirmed purchase as pending', async () => {
    mockSync.mockRejectedValueOnce(new Error('offline'))
    await purchase(pkg)
    expect(mockTrack).toHaveBeenLastCalledWith('purchase_completed', { package: '$rc_monthly', verified: false, pending: true })
  })
})

describe('restore analytics', () => {
  it('counts the tap and a restore that found something', async () => {
    mockSync.mockResolvedValueOnce({ allowed: true, mode: 'paid' })
    await restore()
    expect(mockTrack.mock.calls).toEqual([['restore_tapped'], ['restore_succeeded', { plan_status: 'paid' }]])
  })

  it('counts only the tap when nothing was found', async () => {
    mockSync.mockResolvedValueOnce({ allowed: false, mode: 'expired' })
    await restore()
    expect(mockTrack.mock.calls).toEqual([['restore_tapped']])
  })
})

// A failed sign-in logIn leaves the SDK anonymous; a purchase made then is
// filed under $RCAnonymousID and the server can never connect it (#93).
describe('purchase identity', () => {
  it('logs the SDK in before buying when it is still anonymous', async () => {
    mockAppUserId.mockResolvedValueOnce('$RCAnonymousID:abc')
    mockSync.mockResolvedValueOnce({ allowed: true, mode: 'paid' })
    await purchase(pkg)
    expect(mockLogIn).toHaveBeenCalledWith('user_123')
    expect(mockLogIn.mock.invocationCallOrder[0]).toBeLessThan(mockPurchase.mock.invocationCallOrder[0])
  })

  it('skips logIn when the SDK already has the right user', async () => {
    mockSync.mockResolvedValueOnce({ allowed: true, mode: 'paid' })
    await purchase(pkg)
    expect(mockLogIn).not.toHaveBeenCalled()
    expect(mockPurchase).toHaveBeenCalled()
  })

  it('does not buy when logIn fails', async () => {
    mockAppUserId.mockResolvedValueOnce('$RCAnonymousID:abc')
    mockLogIn.mockRejectedValueOnce(new Error('network down'))
    const outcome = await purchase(pkg)
    expect(outcome.status).toBe('failed')
    expect(outcome).not.toEqual(expect.objectContaining({ message: expect.stringContaining('network down') }))
    expect(mockPurchase).not.toHaveBeenCalled()
  })

  it('does not buy when nobody is signed in', async () => {
    mockUserId.mockReturnValue(null)
    await expect(purchase(pkg)).resolves.toEqual(expect.objectContaining({ status: 'failed' }))
    expect(mockPurchase).not.toHaveBeenCalled()
  })
})

describe('restore identity', () => {
  // restore() only reaches the store on a configured SDK: an Android build with a key.
  let configuredRestore: typeof restore
  beforeAll(() => {
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'test_key'
    jest.isolateModules(() => {
      require('react-native').Platform.OS = 'android'
      const mod = require('./purchases') as typeof import('./purchases')
      mod.initPurchases()
      configuredRestore = mod.restore
    })
  })
  afterAll(() => {
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
  })

  it('logs the SDK in before restoring when it is still anonymous', async () => {
    mockAppUserId.mockResolvedValueOnce('$RCAnonymousID:abc')
    mockSync.mockResolvedValueOnce({ allowed: true, mode: 'paid' })
    await configuredRestore()
    expect(mockLogIn).toHaveBeenCalledWith('user_123')
    expect(mockLogIn.mock.invocationCallOrder[0]).toBeLessThan(mockRestore.mock.invocationCallOrder[0])
  })

  it('does not restore onto the anonymous customer when logIn fails', async () => {
    mockAppUserId.mockResolvedValueOnce('$RCAnonymousID:abc')
    mockLogIn.mockRejectedValueOnce(new Error('network down'))
    await expect(configuredRestore()).rejects.toThrow()
    expect(mockRestore).not.toHaveBeenCalled()
  })
})
