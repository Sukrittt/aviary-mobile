import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { tap } from '@/src/lib/haptics'
import { LineChart, stepPath } from './LineChart'

jest.mock('@/src/lib/haptics', () => ({ tap: jest.fn() }))

// Local midnights: scrubbing snaps to the calendar day the pill shows.
const day = (n: number) => new Date(2026, 0, 1 + n).getTime()

it('holds each value flat until the next point', () => {
  expect(stepPath([{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBe('M0,10 H10 V0 H20')
})

it('scrubs day by day: reports the held value, ticks each new day, clears on release', () => {
  const onScrub = jest.fn()
  const screen = renderWithProviders(
    <LineChart
      data={[{ x: day(0), y: 100 }, { x: day(5), y: 250 }, { x: day(10), y: 250 }]}
      formatX={(x) => `day ${new Date(x).getDate() - 1}`}
      onScrub={onScrub}
    />,
  )
  const plot = screen.getByTestId('line-plot')
  fireEvent(plot, 'layout', { nativeEvent: { layout: { width: 100 } } })

  fireEvent(plot, 'responderGrant', { nativeEvent: { locationX: 30 } })
  expect(onScrub).toHaveBeenLastCalledWith({ x: day(3), y: 100 })
  expect(screen.getByText('day 3')).toBeTruthy()

  // Same day: no repeat tick or report.
  fireEvent(plot, 'responderMove', { nativeEvent: { locationX: 31 } })
  expect(tap).toHaveBeenCalledTimes(1)

  fireEvent(plot, 'responderMove', { nativeEvent: { locationX: 60 } })
  expect(onScrub).toHaveBeenLastCalledWith({ x: day(6), y: 250 })
  expect(tap).toHaveBeenCalledTimes(2)

  fireEvent(plot, 'responderRelease')
  expect(onScrub).toHaveBeenLastCalledWith(null)
  expect(screen.queryByText('day 6')).toBeNull()
})
