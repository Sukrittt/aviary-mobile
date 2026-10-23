import { fireEvent, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { SheetOption, SheetTitle } from './SheetOption'

const colorOf = (label: string) => StyleSheet.flatten(screen.getByText(label).props.style).color

it('colors each tone: plain actions, coral delete, quiet cancel', () => {
  renderWithProviders(
    <>
      <SheetTitle>Rent</SheetTitle>
      <SheetOption label="Edit" onPress={() => {}} />
      <SheetOption label="Delete" tone="destructive" onPress={() => {}} />
      <SheetOption label="Cancel" tone="cancel" onPress={() => {}} />
    </>,
  )
  const colors = new Set([colorOf('Edit'), colorOf('Delete'), colorOf('Cancel')])
  expect(colors.size).toBe(3)
  expect(screen.getByText('Rent')).toBeTruthy()
})

it('fires onPress, and not while disabled', () => {
  const onEdit = jest.fn()
  const onDelete = jest.fn()
  renderWithProviders(
    <>
      <SheetOption label="Edit" onPress={onEdit} />
      <SheetOption label="Delete" onPress={onDelete} disabled />
    </>,
  )
  fireEvent.press(screen.getByRole('button', { name: 'Edit' }))
  fireEvent.press(screen.getByRole('button', { name: 'Delete' }))
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onDelete).not.toHaveBeenCalled()
})
