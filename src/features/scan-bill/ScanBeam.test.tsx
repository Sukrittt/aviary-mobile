import { useEffect, useState, type ComponentProps } from 'react'
import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ScanBeam, revealMs } from './ScanBeam'

type Props = ComponentProps<typeof ScanBeam>

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const items = ['Flat white', 'Croissant', 'Cold brew', 'Avocado toast', 'Bagel', 'Muffin', 'Tea']
  .map((name, i) => ({ key: String(i), name, price: 100 + i }))

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
    <Harness imageUri="data:image/jpeg;base64,AAAA" items={null} total={0} onDone={onDone} />,
  )
  expect(getByLabelText('Reading your bill')).toBeTruthy()
  expect(queryByText('Bill total')).toBeNull()
  act(() => { jest.advanceTimersByTime(10_000) })
  expect(onDone).not.toHaveBeenCalled()
})

it('stamps the bill, pops out the first four items, then hands off to review', () => {
  const onDone = jest.fn()
  const { getByText, queryByText } = renderWithProviders(
    <Harness imageUri={null} items={null} total={0} onDone={onDone} />,
  )
  update({ items, total: 742 })
  expect(getByText('Bill scanned')).toBeTruthy()
  expect(getByText('7 items')).toBeTruthy()
  expect(getByText('Avocado toast')).toBeTruthy()
  expect(queryByText('Bagel')).toBeNull()
  expect(getByText('+3 more')).toBeTruthy()
  expect(getByText('Bill total')).toBeTruthy()

  act(() => { jest.advanceTimersByTime(revealMs(items.length) - 1) })
  expect(onDone).not.toHaveBeenCalled()
  act(() => { jest.advanceTimersByTime(1) })
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('skips ahead on tap', () => {
  const onDone = jest.fn()
  const { getByLabelText } = renderWithProviders(
    <Harness imageUri={null} items={null} total={0} onDone={onDone} />,
  )
  update({ items: [], total: 300 })
  fireEvent.press(getByLabelText('Scan done. Tap to review'))
  expect(onDone).toHaveBeenCalledTimes(1)
})
