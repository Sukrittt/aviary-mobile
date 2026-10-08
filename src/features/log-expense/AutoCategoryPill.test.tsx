import { useEffect, useState, type ComponentProps } from 'react'
import { act, fireEvent } from '@testing-library/react-native'
import { View } from 'react-native'
import * as Reanimated from 'react-native-reanimated'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { AutoCategoryPill, PICKING_LABEL, SETTLE_MS } from './AutoCategoryPill'

type Props = ComponentProps<typeof AutoCategoryPill>

beforeEach(() => jest.useFakeTimers())
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

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
  expect(getByText('Pick a category')).toBeTruthy()
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
  expect(getByText('Pick a category')).toBeTruthy()
})

it("doesn't say picked for you about a category the user picked by hand", () => {
  const onPress = jest.fn()
  const { getByText, getByLabelText } =
    renderPill({ ...base, onPress, selected: groceries, thinking: false, auto: false })
  expect(getByLabelText('Category: Groceries')).toBeTruthy()
  fireEvent.press(getByText('Groceries'))
  expect(onPress).toHaveBeenCalled()
})

function measure(utils: ReturnType<typeof renderPill>, width: number) {
  const row = utils.UNSAFE_getAllByType(View).find((node) => typeof node.props.onLayout === 'function')!
  fireEvent(row, 'layout', { nativeEvent: { layout: { width, height: 17, x: 0, y: 0 } } })
}

it('waits for the width spring before flicking the burst, with no burst on first render', () => {
  let finishWidth: (finished?: boolean) => void = () => {}
  jest.spyOn(Reanimated, 'withSpring').mockImplementation((value, config, callback) => {
    if (config?.stiffness === 110) finishWidth = callback!
    return value
  })
  const utils = renderPill({ ...base, selected: groceries, thinking: false, auto: false })
  measure(utils, 70)
  expect(utils.queryByTestId('pick-burst')).toBeNull()
  utils.rerender({ selected: { emoji: '🚕', name: 'Travel' } })
  expect(utils.queryByTestId('pick-burst')).toBeNull()
  measure(utils, 60)
  expect(utils.queryByTestId('pick-burst')).toBeNull()
  act(() => finishWidth(false))
  expect(utils.queryByTestId('pick-burst')).toBeNull()
  act(() => finishWidth(true))
  expect(utils.queryByTestId('pick-burst')).toBeTruthy()
})

it('ignores an older width completion when another category has been chosen', () => {
  const completions: ((finished?: boolean) => void)[] = []
  jest.spyOn(Reanimated, 'withSpring').mockImplementation((value, config, callback) => {
    if (config?.stiffness === 110) completions.push(callback!)
    return value
  })
  const utils = renderPill({ ...base, selected: groceries, thinking: false, auto: false })
  measure(utils, 70)
  utils.rerender({ selected: { emoji: '🚕', name: 'Travel' } })
  measure(utils, 60)
  utils.rerender({ selected: { emoji: '🏠', name: 'Rent' } })
  measure(utils, 50)
  act(() => completions[0](true))
  expect(utils.queryByTestId('pick-burst')).toBeNull()
  act(() => completions[1](true))
  expect(utils.queryByTestId('pick-burst')).toBeTruthy()
})
