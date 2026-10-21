import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import AccountsScreen from './accounts'
import { addAccount, getAccounts, updateAccount } from '@/src/api/accounts'
import { Alert } from '@/src/components/ui/AlertHost'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), navigate: jest.fn() }),
}))
jest.mock('@/src/lib/netStatus', () => ({ ...jest.requireActual('@/src/lib/netStatus'), useOnline: () => true }))
jest.mock('@/src/api/accounts', () => ({
  ...jest.requireActual('@/src/api/accounts'),
  getAccounts: jest.fn(),
  addAccount: jest.fn(),
  updateAccount: jest.fn(),
}))
let mockReadOnly = false
jest.mock('@/src/hooks/useBudgetSpaces', () => ({
  ...jest.requireActual('@/src/hooks/useBudgetSpaces'),
  useBudgetSpaces: () => ({ active: mockReadOnly ? { id: 'b1', name: 'Home', ownerId: 'o', readOnly: true, members: [{ userId: 'o', name: 'Priya Shah', role: 'owner' }] } : null }),
}))
jest.mock('@/src/api/balanceChecks', () => ({ getBalanceStatus: jest.fn(async () => ({ accounts: ['HDFC', 'Slice'] })) }))

beforeEach(() => {
  jest.clearAllMocks()
  mockReadOnly = false
  ;(getAccounts as jest.Mock).mockResolvedValue([])
  ;(addAccount as jest.Mock).mockResolvedValue({ id: 'x' })
  ;(updateAccount as jest.Mock).mockResolvedValue(undefined)
})

it('offers the balance check names, cash and a card on first visit', async () => {
  const { findByText, findByLabelText, getByLabelText, getByText } = renderWithProviders(<AccountsScreen />)
  expect(await findByText('Start with these?')).toBeTruthy()
  await findByLabelText('HDFC')
  fireEvent.press(getByLabelText('Credit card'))
  await act(async () => {
    fireEvent.press(getByText('Add these 4'))
  })
  await waitFor(() => expect(addAccount).toHaveBeenCalledTimes(4))
  expect((addAccount as jest.Mock).mock.calls.map((c) => c[0])).toEqual([
    { name: 'HDFC', type: 'bank' },
    { name: 'Slice', type: 'bank' },
    { name: 'Cash', type: 'cash' },
    { name: 'Credit card', type: 'credit_card' },
  ])
})

it('lists live accounts and restores an archived one', async () => {
  ;(getAccounts as jest.Mock).mockResolvedValue([
    { id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '1' },
    { id: 'a2', name: 'Old card', type: 'credit_card', archived: true, created_at: '2' },
  ])
  const { findByText, getByLabelText } = renderWithProviders(<AccountsScreen />)
  expect(await findByText('Bank account')).toBeTruthy()
  fireEvent.press(getByLabelText('Edit HDFC'))
  expect(mockPush).toHaveBeenCalledWith('/modals/account?id=a1')
  await act(async () => {
    fireEvent.press(getByLabelText('Restore Old card'))
  })
  await waitFor(() => expect(updateAccount).toHaveBeenCalledWith('a2', { archived: false }))
})

it("opens an account's transactions and deletes it by archiving after a confirm", async () => {
  ;(getAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '1' }])
  const { findByText, getByLabelText, getByText } = renderWithProviders(<AccountsScreen />)
  await findByText('Bank account')
  fireEvent.press(getByLabelText('View HDFC transactions'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/(tabs)/activity', params: { account: 'a1' } })
  fireEvent.press(getByLabelText('Delete HDFC'))
  expect(updateAccount).not.toHaveBeenCalled()
  await act(async () => {
    fireEvent.press(getByText('Delete'))
  })
  await waitFor(() => expect(updateAccount).toHaveBeenCalledWith('a1', { archived: true }))
})

it('hides Add and says why instead of deleting or restoring in a read-only budget', async () => {
  mockReadOnly = true
  const alert = jest.spyOn(Alert, 'alert')
  ;(getAccounts as jest.Mock).mockResolvedValue([
    { id: 'a1', name: 'HDFC', type: 'bank', archived: false, created_at: '1' },
    { id: 'a2', name: 'Old card', type: 'credit_card', archived: true, created_at: '2' },
  ])
  const { findByText, getByLabelText, queryByText, getByTestId } = renderWithProviders(<AccountsScreen />)
  await findByText('Bank account')
  expect(getByTestId('read-only-banner')).toBeTruthy()
  expect(queryByText('Add')).toBeNull()
  fireEvent.press(getByLabelText('Delete HDFC'))
  fireEvent.press(getByLabelText('Restore Old card'))
  expect(alert).toHaveBeenCalledTimes(2)
  expect(alert).toHaveBeenCalledWith('This budget is read-only', expect.any(String), expect.anything(), { sticky: true })
  expect(queryByText('Delete HDFC?')).toBeNull()
  expect(updateAccount).not.toHaveBeenCalled()
})
