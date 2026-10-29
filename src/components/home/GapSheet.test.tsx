import { useEffect, useState } from 'react'
import { act, fireEvent, within } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { GapSheet } from './GapSheet'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useIsFocused: () => true }))
jest.mock('@/src/lib/date', () => ({ ...jest.requireActual('@/src/lib/date'), todayLocal: () => '2026-10-19' }))
let mockSeen: boolean | null = false
const mockSetSeen = jest.fn()
jest.mock('@/src/hooks/useDismissedRolloverBanner', () => ({ useDismissedRolloverBanner: (key: string) => [mockSeen, (v: boolean) => mockSetSeen(key, v)] }))
let mockUser: object | undefined = { hiddenFeatures: [] }
jest.mock('@/src/hooks/useUser', () => ({ useUser: () => ({ data: mockUser }) }))

beforeEach(() => {
  jest.clearAllMocks()
  mockSeen = false
  mockUser = { hiddenFeatures: [] }
})

const AWAY = { Food: '2026-10-15', Travel: '2026-10-01' }

// rerender() would drop renderWithProviders' ThemeProvider, so Home's lastSpent changes through state instead.
const control: { set?: (next: Record<string, string>) => void } = {}
function Home() {
  const [lastSpent, setLastSpent] = useState<Record<string, string>>(AWAY)
  useEffect(() => { control.set = setLastSpent }, [])
  return <GapSheet lastSpent={lastSpent} />
}
const homeRefreshes = (next: Record<string, string>) => act(() => control.set!({ ...next }))

it('offers three calm ways back after two days away, upload first', () => {
  const screen = renderWithProviders(<GapSheet lastSpent={AWAY} />)
  expect(screen.getByText('Pick up where you left off')).toBeTruthy()
  const [hero, type, fresh] = screen.getAllByRole('button')
  expect(within(hero).getByText('Upload a screenshot or statement')).toBeTruthy()
  expect(within(hero).getByText('You check it')).toBeTruthy()
  expect(within(type).getByText('Type what you remember')).toBeTruthy()
  expect(within(fresh).getByText('Start fresh')).toBeTruthy()
})

it('stays hidden after yesterday, or once this gap was answered', () => {
  expect(renderWithProviders(<GapSheet lastSpent={{ Food: '2026-10-18' }} />).queryByText('Pick up where you left off')).toBeNull()
  mockSeen = true
  expect(renderWithProviders(<GapSheet lastSpent={AWAY} />).queryByText('Pick up where you left off')).toBeNull()
})

it('remembers the answer against the last expense date and routes each option', () => {
  const screen = renderWithProviders(<GapSheet lastSpent={AWAY} />)
  fireEvent.press(screen.getByText('Type what you remember'))
  expect(mockSetSeen).toHaveBeenCalledWith('gap-2026-10-15', true)
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/modals/money-brain', params: { capture: '1' } })
  fireEvent.press(screen.getByText('Upload a screenshot or statement'))
  expect(mockPush).toHaveBeenCalledWith('/modals/statement')
  fireEvent.press(screen.getByText('Start fresh'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/modals/fresh-start', params: { since: '2026-10-15' } })
})

it('types into log-expense when Ask Aviary is off', () => {
  mockUser = { hiddenFeatures: ['askAviary'] }
  const screen = renderWithProviders(<GapSheet lastSpent={AWAY} />)
  expect(screen.getByText('Add what you remember, one at a time.')).toBeTruthy()
  fireEvent.press(screen.getByText('Type what you remember'))
  expect(mockPush).toHaveBeenCalledWith('/modals/log-expense')
})

it('is back after leaving an option without logging, so another can be picked', () => {
  const screen = renderWithProviders(<Home />)
  fireEvent.press(screen.getByText('Type what you remember'))
  mockSeen = true
  homeRefreshes(AWAY)
  expect(screen.getByText('Pick up where you left off')).toBeTruthy()
  // Logging something moves the gap on.
  homeRefreshes({ ...AWAY, Food: '2026-10-19' })
  expect(screen.queryByText('Pick up where you left off')).toBeNull()
})

it('stays closed after Not now', () => {
  const screen = renderWithProviders(<Home />)
  fireEvent.press(screen.getByText('Not now'))
  mockSeen = true
  homeRefreshes(AWAY)
  expect(screen.queryByText('Pick up where you left off')).toBeNull()
})
