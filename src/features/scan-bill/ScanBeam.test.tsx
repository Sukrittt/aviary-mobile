import { useEffect, useState, type ComponentProps } from 'react'
import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ScanBeam, REVEAL_MS } from './ScanBeam'

type Props = ComponentProps<typeof ScanBeam>

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

// rerender() would drop renderWithProviders' ThemeProvider, so props change
// through state inside the provider tree instead.
const control: { update?: (next: Partial<Props>) => void } = {}
function Harness(initial: Props) {
  const [props, setProps] = useState(initial)
  useEffect(() => { control.update = (next) => setProps((p) => ({ ...p, ...next })) }, [])
  return <ScanBeam {...props} />
}
const update = (next: Partial<Props>) => act(() => control.update!(next))

it('reads the bill while the scan runs, without finishing on its own', () => {
  const onDone = jest.fn()
  const { getByLabelText, queryByText } = renderWithProviders(
    <Harness imageUri="data:image/jpeg;base64,AAAA" itemCount={null} onDone={onDone} />,
  )
  expect(getByLabelText('Reading your bill')).toBeTruthy()
  expect(queryByText('Bill scanned')).toBeNull()
  act(() => { jest.advanceTimersByTime(10_000) })
  expect(onDone).not.toHaveBeenCalled()
})

it('stamps the bill with the item count, then hands off to review', () => {
  const onDone = jest.fn()
  const { getByText, queryByText } = renderWithProviders(
    <Harness imageUri={null} itemCount={null} onDone={onDone} />,
  )
  update({ itemCount: 7 })
  expect(getByText('Bill scanned')).toBeTruthy()
  expect(getByText('7 items found')).toBeTruthy()
  // The line items live on the review screen, not here.
  expect(queryByText('Bill total')).toBeNull()

  act(() => { jest.advanceTimersByTime(REVEAL_MS - 1) })
  expect(onDone).not.toHaveBeenCalled()
  act(() => { jest.advanceTimersByTime(1) })
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('skips ahead on tap', () => {
  const onDone = jest.fn()
  const { getByLabelText } = renderWithProviders(
    <Harness imageUri={null} itemCount={null} onDone={onDone} />,
  )
  update({ itemCount: 0 })
  fireEvent.press(getByLabelText('Scan done. Tap to review'))
  expect(onDone).toHaveBeenCalledTimes(1)
})
