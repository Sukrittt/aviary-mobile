import { act, fireEvent } from '@testing-library/react-native'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { userKey } from '@/src/hooks/useUser'
import { LogExpenseNavigation } from './LogExpenseNavigation'
import { QUICK_INCOME_PATH } from './IncomeFloodButton'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: jest.fn() }),
  usePathname: () => '/',
}))

// An older account with every extra on, already cached the way Home leaves it.
function renderNav() {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(userKey, { createdAt: '2025-01-01T00:00:00.000Z', manualTransactionCompletedAt: '2025-01-02T00:00:00.000Z' })
  return renderWithProviders(<LogExpenseNavigation />, { queryClient })
}

it('long-pressing + opens the quick-add menu', () => {
  const { getByRole, getByLabelText, queryByLabelText } = renderNav()
  expect(queryByLabelText('Add income')).toBeNull()
  fireEvent(getByRole('tab', { name: 'Log expense' }), 'longPress')
  expect(getByLabelText('Scan a bill')).toBeTruthy()
  fireEvent.press(getByLabelText('Add income'))
  expect(mockPush).toHaveBeenCalledWith(QUICK_INCOME_PATH)
  expect(queryByLabelText('Add income')).toBeNull()
})

it('sends scan a bill through the photo picker on More', () => {
  const { getByRole, getByLabelText } = renderNav()
  fireEvent(getByRole('tab', { name: 'Log expense' }), 'longPress')
  fireEvent.press(getByLabelText('Scan a bill'))
  expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/more', params: { scan: '1' } })
})

// The highlight is derived from the pathname, which only changes once the new
// tab has rendered. Lighting the tapped slot first keeps the nav from sitting
// stale for that whole render.
it('lights the tapped tab before navigating to it', () => {
  jest.useFakeTimers()
  const { getByRole } = renderNav()
  fireEvent.press(getByRole('tab', { name: 'Activity' }))
  expect(getByRole('tab', { name: 'Activity' }).props.accessibilityState.selected).toBe(true)
  expect(getByRole('tab', { name: 'Home' }).props.accessibilityState.selected).toBe(false)
  expect(mockNavigate).not.toHaveBeenCalledWith('/activity')
  act(() => jest.runOnlyPendingTimers())
  expect(mockNavigate).toHaveBeenCalledWith('/activity')
  jest.useRealTimers()
})
