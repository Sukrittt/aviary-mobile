import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Text } from 'react-native'
import { getUser, updateUser, type UserProfile } from '@/src/api/account'
import { CurrencyProvider } from '@/src/context/CurrencyProvider'
import { useCurrency } from '@/src/context/CurrencyContext'
import { CurrencySetting } from './CurrencyPicker'

jest.mock('@/src/api/account', () => ({ getUser: jest.fn(), updateUser: jest.fn() }))
const mockActive: { current: { role: 'owner' | 'member' } | null } = { current: null }
jest.mock('@/src/hooks/useBudgetSpaces', () => ({ useBudgetSpaces: () => ({ active: mockActive.current }) }))
jest.mock('@/src/theme/ThemeProvider', () => ({ useTheme: () => ({ tokens: {} }) }))
jest.mock('@/src/components/shared/Modal', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) => visible ? children : null,
}))

function VisibleCurrency() {
  const { currencyCode, formatCurrency } = useCurrency()
  return <Text accessibilityLabel="Visible currency">{currencyCode} · {formatCurrency(500)}</Text>
}

it('updates the visible currency before the save request settles', async () => {
  let resolveUpdate: (profile: UserProfile) => void = () => {}
  ;(getUser as jest.Mock).mockResolvedValue({ email: 'a@b.com', emailVerified: true, currencyCode: 'INR' })
  ;(updateUser as jest.Mock).mockImplementation(() => new Promise<UserProfile>((resolve) => { resolveUpdate = resolve }))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })

  render(
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider enabled>
        <CurrencySetting />
        <VisibleCurrency />
      </CurrencyProvider>
    </QueryClientProvider>,
  )

  await waitFor(() => expect(screen.getByLabelText('Visible currency').props.children.join('')).toBe('INR · ₹500'))
  fireEvent.press(screen.getByRole('button', { name: 'Currency, Indian Rupee' }))
  fireEvent.changeText(screen.getByLabelText('Search currencies'), 'USD')
  fireEvent.press(screen.getByLabelText('US Dollar, USD, $'))

  await waitFor(() => expect(screen.getByLabelText('Visible currency').props.children.join('')).toBe('USD · $500'))
  expect(screen.queryByTestId('currency-sheet-close')).toBeNull()

  resolveUpdate({ email: 'a@b.com', emailVerified: true, currencyCode: 'USD' })
  await waitFor(() => expect(queryClient.getQueryData<UserProfile>(['user'])?.currencyCode).toBe('USD'))
  queryClient.clear()
})

it("shows a shared budget's currency read-only to a member, since only its owner can change it", async () => {
  mockActive.current = { role: 'member' }
  ;(getUser as jest.Mock).mockResolvedValue({ email: 'a@b.com', emailVerified: true, currencyCode: 'USD' })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })

  render(
    <QueryClientProvider client={queryClient}>
      <CurrencyProvider enabled>
        <CurrencySetting />
      </CurrencyProvider>
    </QueryClientProvider>,
  )

  await waitFor(() => expect(screen.getByLabelText('Currency, US Dollar. Set by the budget owner')).toBeTruthy())
  expect(screen.queryByRole('button', { name: /Currency/ })).toBeNull()
  expect(screen.getByText('Set by the budget owner')).toBeTruthy()
  mockActive.current = null
  queryClient.clear()
})
