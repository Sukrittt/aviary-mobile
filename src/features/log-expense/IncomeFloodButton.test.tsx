import { fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { IncomeFloodButton, QUICK_INCOME_PATH } from './IncomeFloodButton'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

it('opens quick income with its own centre as the flood origin', () => {
  const { getByLabelText } = renderWithProviders(<IncomeFloodButton top={10} right={20} />)
  fireEvent.press(getByLabelText('Add income'))
  expect(mockPush).toHaveBeenCalledWith({ pathname: QUICK_INCOME_PATH, params: { ox: expect.any(String), oy: '28' } })
})
