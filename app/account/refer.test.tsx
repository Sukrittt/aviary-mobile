import { Share } from 'react-native'
import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import ReferScreen from './refer'

const mockGet = jest.fn()
jest.mock('@/src/api/referrals', () => ({
  ...jest.requireActual('@/src/api/referrals'),
  getReferrals: () => mockGet(),
}))
const mockTrack = jest.fn()
jest.mock('@/src/lib/analytics', () => ({ ...jest.requireActual('@/src/lib/analytics'), track: (...a: unknown[]) => mockTrack(...a) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

const summary = { code: 'K7QM4P', link: 'https://www.useaviary.com/r/K7QM4P', joined: 3, activated: 1, monthsEarned: 1, referredBy: null }

describe('Refer screen', () => {
  beforeEach(() => { mockGet.mockReset(); mockTrack.mockReset() })

  it('shows the code and what it has earned', async () => {
    mockGet.mockResolvedValue(summary)
    const { findByText } = renderWithProviders(<ReferScreen />)
    expect(await findByText('K7QM4P')).toBeTruthy()
    expect(await findByText('3 friends joined · 1 month earned')).toBeTruthy()
  })

  it('shares the link and counts it', async () => {
    mockGet.mockResolvedValue(summary)
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction })
    const { findByText, getByText } = renderWithProviders(<ReferScreen />)
    await findByText('K7QM4P')
    fireEvent.press(getByText('Share link'))
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('https://www.useaviary.com/r/K7QM4P') })
    expect(mockTrack).toHaveBeenCalledWith('referral_link_shared', { method: 'share' })
  })
})
