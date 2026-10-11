import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { resendEmailCode } from '@/src/api/account'
import SecurityScreen from './security'

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }))
jest.mock('@/src/lib/netStatus', () => ({ useOnline: () => true, onOnlineTransition: () => () => {} }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn(), flushAnalytics: jest.fn() }))
jest.mock('@/src/hooks/useRefresh', () => ({ useRefresh: () => ({ refreshing: false, onRefresh: jest.fn() }) }))
jest.mock('@/src/hooks/useBillingStatus', () => ({ useBillingStatus: () => ({ data: undefined }) }))
jest.mock('@/src/hooks/useUser', () => ({
  useUser: () => ({ data: { name: 'Ana', email: 'a@b.co', emailVerified: false } }),
  useUpdateUser: () => ({ mutate: jest.fn() }),
  useRestoreAccount: () => ({ mutate: jest.fn() }),
  useSessions: () => ({ data: [], refetch: jest.fn() }),
  usePrivacyProof: () => ({ data: undefined }),
}))
jest.mock('@/src/api/account', () => ({
  resendEmailCode: jest.fn(),
  deleteAccount: jest.fn(),
  revokeAllSessions: jest.fn(),
  revokeSession: jest.fn(),
}))

it('lets you retry the resend when it fails', async () => {
  ;(resendEmailCode as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
  const { getByText, findByText } = renderWithProviders(<SecurityScreen />)
  fireEvent.press(getByText('Resend code'))

  fireEvent.press(await findByText("Couldn't send. Try again"))
  expect(resendEmailCode).toHaveBeenCalledTimes(2)
})
