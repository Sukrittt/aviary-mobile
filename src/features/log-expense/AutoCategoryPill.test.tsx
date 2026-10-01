import { useEffect, useState, type ComponentProps } from 'react'
import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { AutoCategoryPill, PICKING_LABEL, SETTLE_MS } from './AutoCategoryPill'

type Props = ComponentProps<typeof AutoCategoryPill>

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const groceries = { emoji: '🛒', name: 'Groceries' }
const base = { highlighted: false, rollEmojis: ['🍔', '🚕', '🛒'], onPress: () => {} }

// rerender() would drop renderWithProviders' ThemeProvider, so props change
// through state inside the provider tree instead.
const control: { update?: (next: Partial<Props>) => void } = {}
function Harness(initial: Props) {
  const [props, setProps] = useState(initial)
  useEffect(() => { control.update = (next) => setProps((p) => ({ ...p, ...next })) }, [])
  return <AutoCategoryPill {...props} />
}
function renderPill(props: Props) {
  const utils = renderWithProviders(<Harness {...props} />)
  return { ...utils, rerender: (next: Partial<Props>) => act(() => control.update!(next)) }
}

it('shows the placeholder with no category', () => {
  const { getByText } = renderPill({ ...base, selected: null, thinking: false, auto: false })
  expect(getByText('Category')).toBeTruthy()
})

it('says it is picking while thinking, then settles on the auto-picked category', () => {
  const { getByText, getByLabelText, queryByText, rerender } =
    renderPill({ ...base, selected: null, thinking: true, auto: false })
  expect(getByText(PICKING_LABEL)).toBeTruthy()
  expect(getByLabelText('Picking a category')).toBeTruthy()

  rerender({ selected: groceries, thinking: false, auto: true })
  // Still rolling down onto the answer: the label hasn't changed yet.
  expect(getByText(PICKING_LABEL)).toBeTruthy()
  expect(queryByText('Groceries')).toBeNull()

  act(() => { jest.advanceTimersByTime(SETTLE_MS) })
  expect(getByText('Groceries')).toBeTruthy()
  expect(getByLabelText('Category: Groceries, picked for you')).toBeTruthy()
})

it('eases the reel out even when the answer is the category already showing', () => {
  const { getByText, queryByText, rerender } = renderPill({ ...base, selected: groceries, thinking: false, auto: true })
  rerender({ thinking: true })
  expect(getByText(PICKING_LABEL)).toBeTruthy()
  rerender({ thinking: false })
  expect(getByText(PICKING_LABEL)).toBeTruthy()
  act(() => { jest.advanceTimersByTime(SETTLE_MS) })
  expect(queryByText(PICKING_LABEL)).toBeNull()
  expect(getByText('Groceries')).toBeTruthy()
})

it('lands a dictionary hit straight away, without the picking state', () => {
  const { getByLabelText, queryByText, rerender } =
    renderPill({ ...base, selected: null, thinking: false, auto: false })
  rerender({ selected: groceries, thinking: false, auto: true })
  expect(queryByText(PICKING_LABEL)).toBeNull()
  expect(getByLabelText('Category: Groceries, picked for you')).toBeTruthy()
})

it('goes back to what it showed when the AI finds nothing', () => {
  const { getByText, queryByText, rerender } = renderPill({ ...base, selected: null, thinking: true, auto: false })
  rerender({ selected: null, thinking: false, auto: false })
  expect(queryByText(PICKING_LABEL)).toBeNull()
  expect(getByText('Category')).toBeTruthy()
})

it("doesn't say picked for you about a category the user picked by hand", () => {
  const onPress = jest.fn()
  const { getByText, getByLabelText } =
    renderPill({ ...base, onPress, selected: groceries, thinking: false, auto: false })
  expect(getByLabelText('Category: Groceries')).toBeTruthy()
  fireEvent.press(getByText('Groceries'))
  expect(onPress).toHaveBeenCalled()
})

it('flicks a burst of lines when a category lands, but not on first render', () => {
  const { queryByTestId, rerender } = renderPill({ ...base, selected: groceries, thinking: false, auto: false })
  expect(queryByTestId('pick-burst')).toBeNull()
  rerender({ selected: { emoji: '🚕', name: 'Travel' } })
  expect(queryByTestId('pick-burst')).toBeTruthy()
})
