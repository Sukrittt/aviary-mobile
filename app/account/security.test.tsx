import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { clearAccess } from '@/src/api/accessMode'
import { deleteAccount, getSharedBudgets, resendEmailCode } from '@/src/api/account'
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
  currentUserId: () => 'me',
}))
jest.mock('@/src/lib/pendingExpenses', () => ({ clearAll: jest.fn(() => Promise.resolve()) }))
jest.mock('@/src/api/account', () => ({
  resendEmailCode: jest.fn(),
  deleteAccount: jest.fn(),
  getSharedBudgets: jest.fn(async () => []),
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

// Deletion has a restore grace window. Signing back in and restoring syncs the
// offline queue, so delete must leave it on disk.
it('keeps the offline queue when deleting the account', async () => {
  ;(deleteAccount as jest.Mock).mockResolvedValue(undefined)
  const { getAllByText, findByPlaceholderText } = renderWithProviders(<SecurityScreen />)
  fireEvent.press(getAllByText('Delete account')[1])
  fireEvent.changeText(await findByPlaceholderText('a@b.co'), 'a@b.co')
  const buttons = getAllByText('Delete account')
  fireEvent.press(buttons[buttons.length - 1])

  await waitFor(() => expect(clearAccess).toHaveBeenCalled())
  expect(clearAll).not.toHaveBeenCalled()
  expect(deleteAccount).toHaveBeenCalledWith('a@b.co', {})
})

it('asks what happens to each shared budget before the final confirm', async () => {
  ;(deleteAccount as jest.Mock).mockResolvedValue(undefined)
  ;(getSharedBudgets as jest.Mock).mockResolvedValue([
    { id: 'sp_home', name: 'Home', emoji: '🏠', personal: false, members: [{ userId: 'u1', name: 'Rahul Verma' }, { userId: 'u3', name: 'Meera' }] },
    { id: 'sp_goa', name: 'Goa trip', emoji: '✈️', personal: false, members: [{ userId: 'me', name: 'Ana' }, { userId: 'u3', name: 'Meera' }] },
  ])
  const utils = renderWithProviders(<SecurityScreen />)
  fireEvent.press(utils.getAllByText('Delete account')[1])
  expect(await utils.findByText('Your shared budgets')).toBeTruthy()
  // First member picked to begin with; you're never offered yourself.
  expect(utils.getByLabelText('Home: Hand it to Rahul').props.accessibilityState.checked).toBe(true)
  expect(utils.queryByLabelText('Goa trip: Hand it to Ana')).toBeNull()
  fireEvent.press(utils.getByLabelText('Goa trip: Close it'))
  expect(utils.getByText('Everyone in it loses access. It comes back if you restore your account within 7 days.')).toBeTruthy()
  fireEvent.press(utils.getByText('Next'))
  fireEvent.changeText(utils.getByPlaceholderText('a@b.co'), 'a@b.co')
  const buttons = utils.getAllByText('Delete account')
  fireEvent.press(buttons[buttons.length - 1])
  await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('a@b.co', { sp_home: 'u1' }))
})

it('offers a shared personal budget too, so its data can go to the person sharing it', async () => {
  ;(deleteAccount as jest.Mock).mockResolvedValue(undefined)
  ;(getSharedBudgets as jest.Mock).mockResolvedValue([
    { id: 'me', name: 'Personal', emoji: '🐦', personal: true, members: [{ userId: 'u1', name: 'Rahul Verma' }] },
  ])
  const utils = renderWithProviders(<SecurityScreen />)
  fireEvent.press(utils.getAllByText('Delete account')[1])
  expect(await utils.findByLabelText('Personal: Hand it to Rahul')).toBeTruthy()
  fireEvent.press(utils.getByText('Next'))
  fireEvent.changeText(utils.getByPlaceholderText('a@b.co'), 'a@b.co')
  const buttons = utils.getAllByText('Delete account')
  fireEvent.press(buttons[buttons.length - 1])
  await waitFor(() => expect(deleteAccount).toHaveBeenCalledWith('a@b.co', { me: 'u1' }))
})
