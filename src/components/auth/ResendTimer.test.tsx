import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { ResendTimer } from './ResendTimer'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

async function pressResendAfterCooldown(onResend: () => Promise<boolean>) {
  const utils = renderWithProviders(<ResendTimer onResend={onResend} />)
  for (let i = 0; i < 30; i++) act(() => jest.advanceTimersByTime(1000))
  await act(async () => fireEvent.press(utils.getByText("Didn't get it? Resend now")))
  return utils
}

it('restarts the cooldown after a resend goes through', async () => {
  const { getByText } = await pressResendAfterCooldown(() => Promise.resolve(true))
  expect(getByText('Resend code in 30s')).toBeTruthy()
})

it('says so and lets you retry right away when the resend throws', async () => {
  const onResend = jest.fn(() => Promise.reject(new TypeError('Network request failed')))
  const { findByText } = await pressResendAfterCooldown(onResend)
  await act(async () => fireEvent.press(await findByText("Couldn't send. Try again")))
  expect(onResend).toHaveBeenCalledTimes(2)
})

it('treats a refused resend as a failure too', async () => {
  const { findByText } = await pressResendAfterCooldown(() => Promise.resolve(false))
  expect(await findByText("Couldn't send. Try again")).toBeTruthy()
})
