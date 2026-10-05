import { fireEvent } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import * as Haptics from 'expo-haptics'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { PickRow } from './PickRow'

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
}))

it('uses the Lucide check icon for a selected row', () => {
  const { getByTestId, queryByText } = renderWithProviders(
    <PickRow
      emoji="🏠"
      name="Essentials"
      on
      placeholder="Group name"
      onPressEmoji={jest.fn()}
      onChangeName={jest.fn()}
      onToggle={jest.fn()}
    />,
  )

  expect(StyleSheet.flatten(getByTestId('pick-row-check-icon').props.style).transform).toEqual([{ scaleX: 1 }])
  expect(queryByText('✓')).toBeNull()
})

it('animates as a checkbox and gives selection haptics when deselected', () => {
  const onToggle = jest.fn()
  const { getByRole } = renderWithProviders(
    <PickRow
      emoji="🏠"
      name="Essentials"
      on
      placeholder="Group name"
      onPressEmoji={jest.fn()}
      onChangeName={jest.fn()}
      onToggle={onToggle}
    />,
  )

  const toggle = getByRole('checkbox', { name: 'Deselect Essentials' })
  fireEvent(toggle, 'pressIn')
  fireEvent(toggle, 'pressOut')
  fireEvent.press(toggle)

  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1)
  expect(onToggle).toHaveBeenCalledTimes(1)

  const deselected = renderWithProviders(
    <PickRow
      emoji="🏠"
      name="Essentials"
      on={false}
      placeholder="Group name"
      onPressEmoji={jest.fn()}
      onChangeName={jest.fn()}
      onToggle={onToggle}
    />,
  )
  expect(deselected.getByRole('checkbox', { name: 'Select Essentials' })).toBeTruthy()
  expect(StyleSheet.flatten(deselected.getByTestId('pick-row-check-icon').props.style).transform).toEqual([{ scaleX: 0 }])
})
