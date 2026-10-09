import { act, fireEvent } from '@testing-library/react-native'
import { createTestQueryClient, renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { useEffect } from 'react'
import { LogExpenseSubmitProvider, useLogExpenseSubmitPublisher, type LogExpenseSubmitSnapshot } from '@/src/features/log-expense/SubmitContext'
import { LogExpenseNavigation } from '@/src/features/log-expense/LogExpenseNavigation'
let snapshot: LogExpenseSubmitSnapshot | undefined
function NavigationHarness() {
 const publish = useLogExpenseSubmitPublisher()
 useEffect(() => { if (snapshot) publish(snapshot) }, [publish])
 return <LogExpenseNavigation />
}

function TabBar() { return <LogExpenseSubmitProvider><NavigationHarness /></LogExpenseSubmitProvider> }
const mockPush = jest.fn()
const mockReplace = jest.fn()
const mockNavigate = jest.fn()
const mockBack = jest.fn()
let mockPathname = '/'
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, navigate: mockNavigate, back: mockBack }),
  usePathname: () => mockPathname,
}))

beforeEach(() => {
  jest.clearAllMocks()
  snapshot = undefined
  mockPathname = '/'
})

it('navigates to log-expense when the add circle is tapped elsewhere', async () => {
  const { getByLabelText } = renderWithProviders(<TabBar />)
  await act(async () => {})
  fireEvent.press(getByLabelText('Log expense'))
  expect(mockPush).toHaveBeenCalledWith('/modals/log-expense')
  expect(mockBack).not.toHaveBeenCalled()
})

describe('on the log-expense screen', () => {
  beforeEach(() => {
    mockPathname = '/modals/log-expense'
  })

  it('submits (not router.back) when the add circle is tapped', async () => {
    const submit = jest.fn()
    snapshot = { canSubmit: true, saving: false, success: false, submit, onInvalid: jest.fn() }

    const { getByLabelText } = renderWithProviders(<TabBar />)
    await act(async () => {})
    fireEvent.press(getByLabelText('Log expense'))

    expect(submit).toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('disables the circle and blocks submit while saving', async () => {
    const submit = jest.fn()
    snapshot = { canSubmit: true, saving: true, success: false, submit, onInvalid: jest.fn() }

    const { getByLabelText } = renderWithProviders(<TabBar />)
    await act(async () => {})
    const circle = getByLabelText('Log expense')
    expect(circle.props.accessibilityState.disabled).toBe(true)
    fireEvent.press(circle)
    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps the circle tappable when required fields are missing', async () => {
    snapshot = { canSubmit: false, saving: false, success: false, submit: jest.fn(), onInvalid: jest.fn() }

    const { getByLabelText } = renderWithProviders(<TabBar />)
    await act(async () => {})

    expect(getByLabelText('Log expense').props.accessibilityState.disabled).toBe(false)
  })
})

describe('first-expense hint', () => {
  beforeEach(() => {
    mockPathname = '/modals/log-expense'
  })

  function renderWithUser(manualTransactionCompletedAt: string | null, canSubmit: boolean) {
    snapshot = { canSubmit, saving: false, success: false, submit: jest.fn(), onInvalid: jest.fn() }
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(['user'], { email: 'a@b.com', manualTransactionCompletedAt })
    return renderWithProviders(<TabBar />, { queryClient })
  }

  it('points at + once a first-timer can save', async () => {
    const { getByText, getByTestId } = renderWithUser(null, true)
    await act(async () => {})
    expect(getByText('Tap + to save')).toBeTruthy()
    expect(getByTestId('nav-add-hint')).toBeTruthy()
  })

  it('waits for a complete form', async () => {
    const { queryByText } = renderWithUser(null, false)
    await act(async () => {})
    expect(queryByText('Tap + to save')).toBeNull()
  })

  it('never shows after the first expense', async () => {
    const { queryByText } = renderWithUser('2026-10-01T10:00:00Z', true)
    await act(async () => {})
    expect(queryByText('Tap + to save')).toBeNull()
  })
})
