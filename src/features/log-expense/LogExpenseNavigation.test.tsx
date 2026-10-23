import { act, fireEvent } from '@testing-library/react-native'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { userKey } from '@/src/hooks/useUser'
import { LogExpenseNavigation } from './LogExpenseNavigation'
import { QUICK_INCOME_PATH } from './IncomeFloodButton'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
const mockDispatch = jest.fn()
let mockPathname = '/'
// The (tabs) navigator, nested under expo-router's own root stack.
let mockRootState: object | undefined
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, replace: jest.fn() }),
  usePathname: () => mockPathname,
  useNavigationContainerRef: () => ({ getRootState: () => mockRootState, dispatch: mockDispatch }),
}))

beforeEach(() => {
  mockPathname = '/'
  mockRootState = { routes: [{ name: '__root', state: { routes: [{ name: '(tabs)', state: { key: 'tabs-1', routes: [] } }] } }] }
  mockNavigate.mockClear()
  mockDispatch.mockClear()
})

// An older account with every extra on, already cached the way Home leaves it.
function renderNav() {
  const queryClient = createTestQueryClient()
  queryClient.setQueryData(userKey, { createdAt: '2025-01-01T00:00:00.000Z', manualTransactionCompletedAt: '2025-01-02T00:00:00.000Z' })
  return renderWithProviders(<LogExpenseNavigation />, { queryClient })
}

it('long-pressing + opens the quick-add menu', () => {
  const { getByRole, getByLabelText, queryByLabelText } = renderNav()
  expect(queryByLabelText('Add income')).toBeNull()
  fireEvent(getByRole('button', { name: 'Log expense' }), 'longPress')
  expect(getByLabelText('Scan a bill')).toBeTruthy()
  fireEvent.press(getByLabelText('Add income'))
  expect(mockPush).toHaveBeenCalledWith(QUICK_INCOME_PATH)
  expect(queryByLabelText('Add income')).toBeNull()
})

it('opens the statement import from the quick-add menu', () => {
  const { getByRole, getByLabelText } = renderNav()
  fireEvent(getByRole('button', { name: 'Log expense' }), 'longPress')
  fireEvent.press(getByLabelText('Add from statement'))
  expect(mockPush).toHaveBeenCalledWith('/modals/statement')
})

it('sends scan a bill through the photo picker on More', () => {
  const { getByRole, getByLabelText } = renderNav()
  fireEvent(getByRole('button', { name: 'Log expense' }), 'longPress')
  fireEvent.press(getByLabelText('Scan a bill'))
  expect(mockNavigate).toHaveBeenCalledWith({ pathname: '/more', params: { scan: '1' } })
})

// The highlight is derived from the pathname, which only changes once the new
// tab has rendered. Lighting the tapped slot first keeps the nav from sitting
// stale for that whole render.
// The switch itself waits a frame: committed together, the nav's change was
// held back until the new tab's screen had attached, which is the slow part.
it('lights the tapped tab, then jumps straight to it a frame later', () => {
  jest.useFakeTimers()
  const { getByRole } = renderNav()
  fireEvent.press(getByRole('tab', { name: 'Activity' }))
  expect(getByRole('tab', { name: 'Activity' }).props.accessibilityState.selected).toBe(true)
  expect(getByRole('tab', { name: 'Home' }).props.accessibilityState.selected).toBe(false)
  expect(mockDispatch).not.toHaveBeenCalled()
  act(() => jest.runOnlyPendingTimers())
  // By route name, with no new params: router.navigate re-rendered the whole tab.
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'JUMP_TO', payload: { name: 'activity' }, target: 'tabs-1' })
  expect(mockNavigate).not.toHaveBeenCalled()
  jest.useRealTimers()
})

it("falls back to the router when the tabs aren't mounted yet", () => {
  jest.useFakeTimers()
  mockRootState = undefined
  const { getByRole } = renderNav()
  fireEvent.press(getByRole('tab', { name: 'More' }))
  act(() => jest.runOnlyPendingTimers())
  expect(mockNavigate).toHaveBeenCalledWith('/more')
  expect(mockDispatch).not.toHaveBeenCalled()
  jest.useRealTimers()
})
