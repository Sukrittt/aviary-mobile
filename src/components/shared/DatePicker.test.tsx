import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { DatePicker } from './DatePicker'

describe('DatePicker (single)', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 7, 22)) // Sat 22 Aug 2026
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('shows a strip centered on the selected day, at least a week either side', () => {
    const { getByText } = renderWithProviders(<DatePicker mode="single" value="2026-08-19" onChange={jest.fn()} />)
    expect(getByText('Today')).toBeTruthy()
    expect(getByText('Yest')).toBeTruthy()
    expect(getByText('22')).toBeTruthy()
    expect(getByText('3 days ago')).toBeTruthy()
    // selected is 19 Aug; strip must reach at least a week before (12) and after (26)
    expect(getByText('12')).toBeTruthy()
    expect(getByText('26')).toBeTruthy()
  })

  it('picks a strip day without opening the calendar', () => {
    const onChange = jest.fn()
    const { getByText, queryByText } = renderWithProviders(<DatePicker mode="single" value="2026-08-19" onChange={onChange} />)
    fireEvent.press(getByText('Today'))
    expect(onChange).toHaveBeenCalledWith('2026-08-22')
    expect(queryByText('Pick a date')).toBeNull()
  })

  it('opens the calendar in a sheet and closes it on pick', () => {
    const onChange = jest.fn()
    const { getByText, getAllByText, queryByText } = renderWithProviders(<DatePicker mode="single" value="2026-08-19" onChange={onChange} />)
    expect(queryByText('August 2026')).toBeNull()
    fireEvent.press(getByText('Another date…'))
    expect(getByText('Pick a date')).toBeTruthy()
    expect(getByText('August 2026')).toBeTruthy()

    fireEvent.press(getByText('‹')) // July 2026, outside the strip
    fireEvent.press(getAllByText('3').at(-1)!)
    expect(onChange).toHaveBeenCalledWith('2026-07-03')
    expect(queryByText('Pick a date')).toBeNull()
  })

  it('shows the month next to the date label', () => {
    const { getByText } = renderWithProviders(<DatePicker mode="single" value="2026-08-19" onChange={jest.fn()} />)
    expect(getByText('Date · August')).toBeTruthy()
  })

  it('allows a later day in the current month but blocks days in a future month', () => {
    const onChange = jest.fn()
    const { getByText, getAllByText } = renderWithProviders(<DatePicker mode="single" value="2026-08-19" onChange={onChange} />)
    fireEvent.press(getByText('Another date…'))

    // 25 Aug is after "today" (22 Aug) but still the current month: pickable.
    fireEvent.press(getAllByText('25').at(-1)!)
    expect(onChange).toHaveBeenCalledWith('2026-08-25')

    onChange.mockClear()
    fireEvent.press(getByText('Another date…'))
    fireEvent.press(getByText('›')) // nav to September 2026
    expect(getByText('September 2026')).toBeTruthy()
    expect(getAllByText('5').at(-1)).toBeDisabled()
  })
})
