import { act, fireEvent, waitFor } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import AccountsScreen from './accounts'
import { addAccount, getAccounts, updateAccount } from '@/src/api/accounts'

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
jest.mock('@/src/api/balanceChecks', () => ({ getBalanceStatus: jest.fn(async () => ({ accounts: ['HDFC', 'Slice'] })) }))

beforeEach(() => {
  jest.clearAllMocks()
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
