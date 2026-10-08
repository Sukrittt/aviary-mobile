import { render } from '@testing-library/react-native'
import { ThemeProvider } from '@/src/theme/ThemeProvider'
import { tabsNavCover } from '@/src/components/nav/TabBar'
import TabsLayout from './_layout'

let mockPathname = '/more'
let mockRoutes = [{ name: '(tabs)' }]
jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useNavigation: () => ({ getState: () => ({ routes: mockRoutes }), addListener: () => () => {} }),
}))
jest.mock('expo-router/js-tabs', () => ({ Tabs: Object.assign(function Tabs() { return null }, { Screen: function Screen() { return null } }) }))
jest.mock('@/src/hooks/useHabitNudges', () => ({ useHabitNudges: () => {} }))
jest.mock('@/src/features/week-recap/useWeekRecap', () => ({ useWeekRecapGate: () => {} }))
jest.mock('@/src/features/changelog/useChangelogGate', () => ({ useChangelogGate: () => {} }))

beforeEach(() => {
  mockPathname = '/more'
  mockRoutes = [{ name: '(tabs)' }]
  tabsNavCover.value = 0
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
