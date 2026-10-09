import { fireEvent } from '@testing-library/react-native'
import { router } from 'expo-router'
import { renderWithProviders } from '@/src/test-utils/renderWithProviders'
import NotFound from './+not-found'

jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, Stack: { Screen: () => null } }))

it('explains the dead link and sends the user home', () => {
  const screen = renderWithProviders(<NotFound />)
  expect(screen.getByRole('header', { name: 'This page flew off' })).toBeTruthy()
  fireEvent.press(screen.getByRole('button', { name: 'Take me home' }))
  expect(router.replace).toHaveBeenCalledWith('/')
})
