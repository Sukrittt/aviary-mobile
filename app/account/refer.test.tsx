import { Share } from 'react-native'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import ReferScreen from './refer'

const mockGet = jest.fn()
const mockApply = jest.fn()
jest.mock('@/src/api/referrals', () => ({
  ...jest.requireActual('@/src/api/referrals'),
  getReferrals: () => mockGet(),
  applyReferralCode: (c: string) => mockApply(c),
}))
const mockTrack = jest.fn()
jest.mock('@/src/lib/analytics', () => ({ ...jest.requireActual('@/src/lib/analytics'), track: (...a: unknown[]) => mockTrack(...a) }))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }))

const summary = { code: 'K7QM4P', link: 'https://www.useaviary.com/r/K7QM4P', joined: 3, activated: 1, monthsEarned: 1, canEnterCode: true, referredBy: null }

describe('Refer screen', () => {
  beforeEach(() => { mockGet.mockReset(); mockApply.mockReset(); mockTrack.mockReset() })

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

  it.each([
    ['not_found', "That code doesn't exist."],
    ['too_late', 'first 7 days'],
    ['own_code', "That's your own code."],
  ])('words %s', async (err, copy) => {
    mockGet.mockResolvedValue(summary)
    mockApply.mockResolvedValue(err)
    const { findByLabelText, getByText, findByText } = renderWithProviders(<ReferScreen />)
    fireEvent.changeText(await findByLabelText('Got a code from a friend?'), 'zz zz-zz')
    fireEvent.press(getByText('Apply'))
    expect(await findByText(new RegExp(copy.replace(/[.']/g, '.')))).toBeTruthy()
    expect(mockApply).toHaveBeenCalledWith('ZZZZZZ')
  })

  it('keeps the confirmation up once a code is applied', async () => {
    mockGet.mockResolvedValue(summary)
    mockApply.mockResolvedValue(null)
    const { findByLabelText, getByText, findByText } = renderWithProviders(<ReferScreen />)
    fireEvent.changeText(await findByLabelText('Got a code from a friend?'), 'priya')
    fireEvent.press(getByText('Apply'))
    expect(await findByText(/Code applied/)).toBeTruthy()
    expect(await findByText('You joined with code PRIYA.')).toBeTruthy()
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1))
  })

  it('hides the code field after the first week', async () => {
    mockGet.mockResolvedValue({ ...summary, canEnterCode: false })
    const { findByText, queryByLabelText } = renderWithProviders(<ReferScreen />)
    await findByText('K7QM4P')
    expect(queryByLabelText('Got a code from a friend?')).toBeNull()
  })
})
