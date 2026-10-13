import { fireEvent, render } from '@testing-library/react-native'
import { Try } from 'expo-router/build/views/Try'
import { posthog } from '@/src/lib/analytics'
import { CrashScreen } from './CrashScreen'

function Boom(): never {
  throw new Error('persisted cache shape mismatch: 503')
}

it('catches a render throw, reports it, and retries without showing the raw error', () => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
  const retry = jest.fn()
  const screen = render(
    <Try catch={({ error }) => <CrashScreen error={error} retry={retry} />}>
      <Boom />
    </Try>
  )

  expect(screen.getByRole('header', { name: 'Something went wrong' })).toBeTruthy()
  expect(screen.queryByText(/503/)).toBeNull()
  expect(posthog.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'persisted cache shape mismatch: 503' }))

  fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
  expect(retry).toHaveBeenCalled()
})
