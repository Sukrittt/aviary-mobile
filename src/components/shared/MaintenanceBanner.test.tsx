import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { Linking } from 'react-native'
import type { BillingStatus } from '@/src/api/billing'
import { GraceBanner, MaintenanceBanner } from './MaintenanceBanner'

jest.mock('@/src/api/client', () => ({ apiFetch: jest.fn() }))
jest.mock('@/src/lib/purchases', () => ({ managementUrl: async () => null }))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

const { apiFetch } = jest.requireMock('@/src/api/client') as { apiFetch: jest.Mock }

const status = (on: boolean, message: string) => ({ ok: true, json: async () => ({ aiDisabled: false, maintenance: { on, message } }) })

describe('MaintenanceBanner', () => {
  it('shows the message when maintenance is on, and hides it when dismissed', async () => {
    apiFetch.mockResolvedValue(status(true, 'Down for maintenance at 11pm'))
    const { findByText, getByLabelText, queryByText } = renderWithProviders(<MaintenanceBanner />)
    await findByText('Down for maintenance at 11pm')
    fireEvent.press(getByLabelText('Dismiss'))
    // Still mounted while it animates out, but hidden from the accessibility tree.
    expect(queryByText('Down for maintenance at 11pm', { includeHiddenElements: false })).toBeNull()
  })

  it('renders nothing when maintenance is off', async () => {
    apiFetch.mockResolvedValue(status(false, 'stale message'))
    const { queryByText } = renderWithProviders(<MaintenanceBanner />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(queryByText('stale message')).toBeNull()
  })
})

describe('GraceBanner', () => {
  const grace = (store: 'play' | 'web') => ({ mode: 'paid', renewalState: 'grace', store, paidExpiresAt: '2026-11-02T00:00:00Z' }) as BillingStatus
  const until = new Date('2026-11-02T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

  it('tells a Play subscriber where to fix it, and opens Play on tap', async () => {
    apiFetch.mockResolvedValue(status(false, ''))
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    const { findByText } = renderWithProviders(<GraceBanner status={grace('play')} />)
    fireEvent.press(await findByText(`Payment didn't go through. You keep everything until ${until}. Fix it in Google Play.`))
    await waitFor(() => expect(open).toHaveBeenCalledWith(expect.stringContaining('play.google.com/store/account/subscriptions')))
  })

  it('stays out of the way of maintenance', async () => {
    apiFetch.mockResolvedValue(status(true, 'Down for maintenance at 11pm'))
    const { queryByText } = renderWithProviders(<GraceBanner status={grace('web')} />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    await waitFor(() => expect(queryByText(/Payment didn't go through/, { includeHiddenElements: false })).toBeNull())
  })

  it('says nothing outside grace, and stays dismissed for the session', async () => {
    apiFetch.mockResolvedValue(status(false, ''))
    const active = renderWithProviders(<GraceBanner status={{ ...grace('web'), renewalState: 'active' }} />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(active.queryByText(/Payment/)).toBeNull()
    active.unmount()
    const { findByText, getByLabelText, unmount } = renderWithProviders(<GraceBanner status={grace('web')} />)
    await findByText(`Payment didn't go through. We're retrying. You keep everything until ${until}.`)
    fireEvent.press(getByLabelText('Dismiss'))
    unmount()
    const again = renderWithProviders(<GraceBanner status={grace('web')} />)
    expect(again.queryByText(/Payment didn't go through/, { includeHiddenElements: false })).toBeNull()
  })
})
