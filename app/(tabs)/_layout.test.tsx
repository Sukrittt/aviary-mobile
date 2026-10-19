import { render } from '@testing-library/react-native'
import { ThemeProvider } from '@/src/theme/ThemeProvider'
import { tabsNavCover } from '@/src/components/nav/TabBar'
import TabsLayout from './_layout'

let mockPathname = '/more'
let mockRoutes = [{ name: '(tabs)' }]
const mockDispatch = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useNavigationContainerRef: () => ({
    getRootState: () => ({ routes: [{ name: '__root', state: { routes: [{ name: '(tabs)', state: { key: 'tabs-1', index: 3, routes: [{ name: 'index' }, { name: 'activity' }, { name: 'envelopes' }, { name: 'more' }] } }] } }] }),
    dispatch: mockDispatch,
  }),
  useNavigation: () => ({ getState: () => ({ routes: mockRoutes }), addListener: () => () => {} }),
}))
const mockTabs = jest.fn((_props: { screenOptions?: { animation?: string } }) => null)
jest.mock('expo-router/js-tabs', () => ({ Tabs: Object.assign((props: { screenOptions?: { animation?: string } }) => mockTabs(props), { Screen: function Screen() { return null } }) }))
jest.mock('@/src/hooks/useHabitNudges', () => ({ useHabitNudges: () => {} }))
jest.mock('@/src/features/week-recap/useWeekRecap', () => ({ useWeekRecapGate: () => {} }))
jest.mock('@/src/features/changelog/useChangelogGate', () => ({ useChangelogGate: () => {} }))

beforeEach(() => {
  mockPathname = '/more'
  mockRoutes = [{ name: '(tabs)' }]
  tabsNavCover.value = 0
  mockDispatch.mockClear()
})

it('stands in for the nav while a screen is pushed over the tabs', () => {
  const view = render(<TabsLayout />, { wrapper: ThemeProvider })
  mockPathname = '/account/archive'
  view.rerender(<TabsLayout />)
  expect(tabsNavCover.value).toBe(1)
})

it('stays hidden when signing out drops the tabs from the stack', () => {
  const view = render(<TabsLayout />, { wrapper: ThemeProvider })
  mockPathname = '/welcome'
  mockRoutes = [{ name: '(auth)/welcome' }]
  view.rerender(<TabsLayout />)
  expect(tabsNavCover.value).toBe(0)
})

it('switches tabs instantly, with no fade between them', () => {
  render(<TabsLayout />, { wrapper: ThemeProvider })
  expect(mockTabs.mock.calls[0][0].screenOptions?.animation).toBe('none')
})

it('mounts the other tabs once the landing tab is up, so a first visit is no slower than a repeat one', () => {
  jest.useFakeTimers()
  render(<TabsLayout />, { wrapper: ThemeProvider })
  expect(mockDispatch).not.toHaveBeenCalled()
  jest.runOnlyPendingTimers()
  expect(mockDispatch.mock.calls.map(([a]) => a.payload.name)).toEqual(['index', 'activity', 'envelopes'])
  expect(mockDispatch).toHaveBeenCalledWith({ type: 'PRELOAD', payload: { name: 'activity' }, target: 'tabs-1' })
  jest.useRealTimers()
})
