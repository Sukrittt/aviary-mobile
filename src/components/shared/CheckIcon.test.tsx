import { render } from '@testing-library/react-native'
import * as Haptics from 'expo-haptics'
import { CheckIcon } from './CheckIcon'

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}))

beforeEach(() => jest.mocked(Haptics.notificationAsync).mockClear())

it('buzzes once when it draws', () => {
  render(<CheckIcon color="#0a0" />)
  expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1)
})

it('stays quiet when another check already buzzed, even if that changes later', () => {
  const screen = render(<CheckIcon color="#0a0" haptic={false} />)
  screen.rerender(<CheckIcon color="#0a0" haptic />)
  expect(Haptics.notificationAsync).not.toHaveBeenCalled()
})
