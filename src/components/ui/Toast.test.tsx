import { act, fireEvent, render } from '@testing-library/react-native'
import { ThemeProvider } from '@/src/theme/ThemeProvider'
import { Toast, dropInStyle } from './Toast'

const notice = (trigger: number, message = 'Add an amount, item and category') => (
  <ThemeProvider><Toast trigger={trigger} message={message} /></ThemeProvider>
)

// The animation mock doesn't repaint styles after an effect changes a shared
// value. Check the semantic visibility, independently of the native fade.
function expectShown(screen: ReturnType<typeof render>, shown: boolean) {
  expect(screen.getByRole('alert', { includeHiddenElements: true }).props.accessibilityElementsHidden).toBe(!shown)
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

it('stays hidden until triggered and hides after its reading time', () => {
  const screen = render(notice(0))
  expectShown(screen, false)
  screen.rerender(notice(1))
  expectShown(screen, true)
  act(() => jest.advanceTimersByTime(2600))
  expectShown(screen, false)
})

it('restarts its timer on a repeat tap and can show again after dismissal', () => {
  const screen = render(notice(0))
  screen.rerender(notice(1))
  act(() => jest.advanceTimersByTime(2000))
  screen.rerender(notice(2))
  act(() => jest.advanceTimersByTime(1000))
  expectShown(screen, true)
  act(() => jest.advanceTimersByTime(1600))
  expectShown(screen, false)
  screen.rerender(notice(3))
  expectShown(screen, true)
})

it('updates missing-field copy while visible and clears when the user fixes it', () => {
  const screen = render(notice(0))
  screen.rerender(notice(1))
  screen.rerender(notice(1, 'Add a category'))
  expect(screen.getByText('Add a category')).toBeTruthy()
  screen.rerender(notice(1, ''))
  expectShown(screen, false)
  // Keep the last copy during the exit, so it never flashes an empty surface.
  expect(screen.getByText('Add a category', { includeHiddenElements: true })).toBeTruthy()
})

it('uses a fade without translation, stretch or tilt under reduced motion', () => {
  const style = dropInStyle(0.5, 1.025, 1, true)
  expect(style.opacity).toBeGreaterThan(0)
  expect(style.opacity).toBeLessThan(1)
  expect(style.transform).toEqual([])
})

it('keeps an Undo toast up for its own duration, and the action hides it', () => {
  const onUndo = jest.fn()
  const undo = (trigger: number) => (
    <ThemeProvider><Toast trigger={trigger} message="Deleted Chai" durationMs={5000} action={{ label: 'Undo', onPress: onUndo }} /></ThemeProvider>
  )
  const screen = render(undo(0))
  screen.rerender(undo(1))
  // With an action the pill isn't one accessible element, so read its text instead.
  act(() => jest.advanceTimersByTime(4000))
  expect(screen.queryByText('Deleted Chai', { includeHiddenElements: false })).toBeTruthy()
  fireEvent.press(screen.getByText('Undo'))
  expect(onUndo).toHaveBeenCalled()
  expect(screen.queryByText('Deleted Chai', { includeHiddenElements: false })).toBeNull()
})
