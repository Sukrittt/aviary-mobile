import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { tap } from '@/src/lib/haptics'
import { LineChart, stepPath } from './LineChart'

jest.mock('@/src/lib/haptics', () => ({ tap: jest.fn() }))

const DAY = 86_400_000

it('holds each value flat until the next point', () => {
  expect(stepPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBe('M0,10 H10 V0 H20')
})

it('scrubs day by day: reports the held value, ticks each new day, clears on release', () => {
  const onScrub = jest.fn()
  const screen = renderWithProviders(
    <LineChart
      data={[{ x: 0, y: 100 }, { x: 5 * DAY, y: 250 }, { x: 10 * DAY, y: 250 }]}
      formatX={(x) => `day ${x / DAY}`}
      onScrub={onScrub}
    />,
  )
  const plot = screen.getByTestId('line-plot')
  fireEvent(plot, 'layout', { nativeEvent: { layout: { width: 100 } } })

  fireEvent(plot, 'responderGrant', { nativeEvent: { locationX: 30 } })
  expect(onScrub).toHaveBeenLastCalledWith({ x: 3 * DAY, y: 100 })
  expect(screen.getByText('day 3')).toBeTruthy()

  // Same day: no repeat tick or report.
  fireEvent(plot, 'responderMove', { nativeEvent: { locationX: 31 } })
  expect(tap).toHaveBeenCalledTimes(1)

  fireEvent(plot, 'responderMove', { nativeEvent: { locationX: 60 } })
  expect(onScrub).toHaveBeenLastCalledWith({ x: 6 * DAY, y: 250 })
  expect(tap).toHaveBeenCalledTimes(2)

  fireEvent(plot, 'responderRelease')
  expect(onScrub).toHaveBeenLastCalledWith(null)
  expect(screen.queryByText('day 6')).toBeNull()
})
