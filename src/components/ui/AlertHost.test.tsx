import { act, fireEvent } from '@testing-library/react-native'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import { Alert, AlertHost } from './AlertHost'

describe('AlertHost', () => {
  it('shows the title and message from Alert.alert, and defaults to a single OK button', () => {
    const { getByText } = renderWithProviders(<AlertHost />)
    act(() => Alert.alert('Could not save', 'Check your connection and try again.'))
    expect(getByText('Could not save')).toBeTruthy()
    expect(getByText('Check your connection and try again.')).toBeTruthy()
    expect(getByText('OK')).toBeTruthy()
  })

  it('fires the pressed button\'s onPress and dismisses', () => {
    const onDelete = jest.fn()
    const { getByText, queryByText } = renderWithProviders(<AlertHost />)
    act(() =>
      Alert.alert('Delete holding', 'Remove "AAPL"? This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]),
    )
    fireEvent.press(getByText('Delete'))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(queryByText('Delete holding')).toBeNull()
  })

  it("keeps a sticky alert up over a screen's own one that follows it", () => {
    const { getByText, queryByText } = renderWithProviders(<AlertHost />)
    act(() => Alert.alert('This budget is read-only', undefined, undefined, { sticky: true }))
    act(() => Alert.alert("Couldn't save", 'Check your connection and try again.'))
    expect(getByText('This budget is read-only')).toBeTruthy()
    expect(queryByText("Couldn't save")).toBeNull()
  })
})
