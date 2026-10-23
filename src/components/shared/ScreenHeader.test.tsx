import { fireEvent, render, screen } from '@testing-library/react-native'
import { HeaderButton, ScreenHeader } from './ScreenHeader'

jest.mock('@/src/theme/ThemeProvider', () => ({ useTheme: () => ({ tokens: jest.requireActual('@/src/theme/tokens').darkTokens }) }))

it('renders a back button, title, subtitle and right action', () => {
  const onBack = jest.fn()
  const onAdd = jest.fn()
  render(
    <ScreenHeader
      title="Accounts"
      subtitle="Where your money lives"
      onBack={onBack}
      right={<HeaderButton label="Add" onPress={onAdd} />}
    />
  )

  expect(screen.getByRole('header', { name: 'Accounts' })).toBeTruthy()
  expect(screen.getByText('Where your money lives')).toBeTruthy()

  fireEvent.press(screen.getByRole('button', { name: 'Back' }))
  fireEvent.press(screen.getByRole('button', { name: 'Add' }))
  expect(onBack).toHaveBeenCalled()
  expect(onAdd).toHaveBeenCalled()
})

it('labels the button Close for modals and respects backDisabled', () => {
  const onBack = jest.fn()
  render(<ScreenHeader title="Edit amount" onBack={onBack} close backDisabled />)

  fireEvent.press(screen.getByRole('button', { name: 'Close' }))
  expect(onBack).not.toHaveBeenCalled()
})

it('has no way out when onBack is omitted', () => {
  render(<ScreenHeader title="Plan & billing" />)
  expect(screen.queryByRole('button')).toBeNull()
})

it('draws in the caller-supplied tokens when a screen recolours itself', () => {
  const tokens = { ...jest.requireActual('@/src/theme/tokens').darkTokens, text: '#ffffff' }
  render(<ScreenHeader title="Add income" tokens={tokens} />)
  expect(screen.getByRole('header', { name: 'Add income' })).toHaveStyle({ color: '#ffffff' })
})
