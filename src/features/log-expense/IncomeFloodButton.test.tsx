import { fireEvent } from '@testing-library/react-native'
import * as Reanimated from 'react-native-reanimated'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { IncomeFloodButton, QUICK_INCOME_PATH } from './IncomeFloodButton'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useIsFocused: () => true,
}))

it('floods the screen green, then opens quick income once', () => {
  // The mock's withTiming jumps straight to the end; finish the animation too.
  jest.spyOn(Reanimated, 'withTiming').mockImplementation(((v: number, _c: unknown, done?: (f: boolean) => void) => (done?.(true), v)) as never)
  const { getByLabelText } = renderWithProviders(<IncomeFloodButton top={0} right={0} />)
  fireEvent.press(getByLabelText('Add income'))
  fireEvent.press(getByLabelText('Add income'))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledWith(QUICK_INCOME_PATH)
})
