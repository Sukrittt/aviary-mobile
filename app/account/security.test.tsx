import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { clearAccess } from '@/src/api/accessMode'
import { deleteAccount, resendEmailCode } from '@/src/api/account'
import { clearAll } from '@/src/lib/pendingExpenses'
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
jest.mock('@/src/api/accessMode', () => ({
  ...jest.requireActual('@/src/api/accessMode'),
  clearAccess: jest.fn(),
  currentUserId: () => 'user_a',
}))
jest.mock('@/src/lib/pendingExpenses', () => ({ clearAll: jest.fn(() => Promise.resolve()) }))
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

// The logout hook keeps the queue for re-sign-in. After a delete nothing can
// ever sync it, so it has to go before clearAccess forgets whose it is.
it('wipes the offline queue before signing out a deleted account', async () => {
  ;(deleteAccount as jest.Mock).mockResolvedValue(undefined)
  const { getAllByText, getByPlaceholderText } = renderWithProviders(<SecurityScreen />)
  fireEvent.press(getAllByText('Delete account')[1])
  fireEvent.changeText(getByPlaceholderText('a@b.co'), 'a@b.co')
  const buttons = getAllByText('Delete account')
  fireEvent.press(buttons[buttons.length - 1])

  await waitFor(() => expect(clearAccess).toHaveBeenCalled())
  expect(clearAll).toHaveBeenCalledWith('user_a')
  expect((clearAll as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
    (clearAccess as jest.Mock).mock.invocationCallOrder[0],
  )
})
