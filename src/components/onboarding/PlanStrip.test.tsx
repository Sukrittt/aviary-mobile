import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { PlanStrip } from './PlanStrip'

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}))

// Drives rem from inside the providers, since a bare rerender would drop them.
function Harness() {
  const [rem, setRem] = useState(0)
  return (
    <>
      <PlanStrip rem={rem} />
      {[0, 500, -200].map((v) => (
        <Pressable key={v} onPress={() => setRem(v)}><Text>{`set ${v}`}</Text></Pressable>
      ))}
    </>
  )
}

it('opens on the beat, shows the leftover when off, and plays the beat again once settled', () => {
  jest.useFakeTimers()
  const { getByText, queryByText } = renderWithProviders(<Harness />)
  expect(getByText(/has a job\.$/)).toBeTruthy()
  act(() => jest.advanceTimersByTime(2500))
  expect(getByText('All planned')).toBeTruthy()

  fireEvent.press(getByText('set 500'))
  expect(getByText('Left to plan')).toBeTruthy()
  expect(queryByText(/has a job\.$/)).toBeNull()
  fireEvent.press(getByText('set -200'))
  expect(getByText('Over by')).toBeTruthy()

  fireEvent.press(getByText('set 0'))
  expect(getByText(/has a job\.$/)).toBeTruthy()
  jest.useRealTimers()
})
