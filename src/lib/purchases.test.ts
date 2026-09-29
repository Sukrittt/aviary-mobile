import Purchases from 'react-native-purchases'
import type { PurchasesPackage } from 'react-native-purchases'
import { syncBilling } from '../api/billing'
import { track } from './analytics'
import { purchase, restore } from './purchases'

jest.mock('./analytics', () => ({ track: jest.fn() }))
jest.mock('../api/billing', () => ({ syncBilling: jest.fn() }))
jest.mock('../api/accessMode', () => ({
  accessMode: { subscribe: jest.fn(), subscribeLogout: jest.fn() },
  currentUserId: jest.fn(() => null),
}))

const pkg = { identifier: '$rc_monthly' } as PurchasesPackage
const mockPurchase = Purchases.purchasePackage as jest.Mock
const mockSync = syncBilling as jest.Mock
const mockTrack = track as jest.Mock

beforeEach(() => jest.clearAllMocks())

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
