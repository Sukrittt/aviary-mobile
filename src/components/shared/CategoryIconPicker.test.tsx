import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { CategoryIconPicker, iconLabel } from './CategoryIconPicker'

jest.mock('@/src/theme/ThemeProvider', () => ({ useTheme: () => ({ tokens: jest.requireActual('@/src/theme/tokens').darkTokens }) }))

const tint = { bg: '#000', ink: '#fff' }

it('labels icons in plain words', () => {
  expect(iconLabel('ForkKnife')).toBe('Fork knife')
})

it('opens a searchable grid and picks an icon', () => {
  const onChange = jest.fn()
  render(<CategoryIconPicker value="House" onChange={onChange} tint={tint}><Text>Rent</Text></CategoryIconPicker>)
  expect(screen.queryByLabelText('Search icons')).toBeNull()

  fireEvent.press(screen.getByLabelText('Icon: House. Change icon'))
  fireEvent.changeText(screen.getByLabelText('Search icons'), 'tree')
  fireEvent.press(screen.getByLabelText('Tree'))

  expect(onChange).toHaveBeenCalledWith('Tree')
  expect(screen.queryByLabelText('Search icons')).toBeNull()
})

it('says so when nothing matches', () => {
  render(<CategoryIconPicker value="House" onChange={jest.fn()} tint={tint}><Text>Rent</Text></CategoryIconPicker>)
  fireEvent.press(screen.getByLabelText('Icon: House. Change icon'))
  fireEvent.changeText(screen.getByLabelText('Search icons'), 'zzzz')
  expect(screen.getByText("No icons match that. Try another word.")).toBeTruthy()
})
