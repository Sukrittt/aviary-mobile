import { act, render } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { peekPendingShare, setPendingShare, takePendingShare } from '@/src/lib/pendingShare'
import { ShareCatcher, ShareOpener } from './ShareIntake'

const mockReset = jest.fn()
let mockIntent: { hasShareIntent: boolean; shareIntent: { text: string | null; files: object[] | null } }
jest.mock('expo-share-intent', () => ({
  useShareIntent: () => ({ ...mockIntent, resetShareIntent: mockReset }),
}))

const mockPush = jest.fn()
let mockPath = '/'
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPath,
}))

beforeEach(() => {
  jest.clearAllMocks()
  takePendingShare()
  mockPath = '/'
  Platform.OS = 'android'
})

describe('ShareCatcher', () => {
  it('keeps a shared screenshot and clears it natively', () => {
    mockIntent = {
      hasShareIntent: true,
      shareIntent: { text: null, files: [{ path: '/data/gpay.png', mimeType: 'image/png', width: 1080, height: 2400, fileName: 'gpay.png', size: 1, duration: null }] },
    }
    render(<ShareCatcher />)
    expect(peekPendingShare()).toEqual({ image: { uri: '/data/gpay.png', mimeType: 'image/png', width: 1080, height: 2400 } })
    expect(mockReset).toHaveBeenCalled()
  })

  it('keeps a shared text receipt', () => {
    mockIntent = { hasShareIntent: true, shareIntent: { text: 'Paid ₹250 to Ramesh', files: null } }
    render(<ShareCatcher />)
    expect(peekPendingShare()).toEqual({ text: 'Paid ₹250 to Ramesh' })
  })

  it('does nothing without a share', () => {
    mockIntent = { hasShareIntent: false, shareIntent: { text: null, files: null } }
    render(<ShareCatcher />)
    expect(peekPendingShare()).toBeNull()
    expect(mockReset).not.toHaveBeenCalled()
  })
})

describe('ShareOpener', () => {
  it('opens a share made before sign-in', () => {
    setPendingShare({ text: 'Paid ₹250 to Ramesh' })
    render(<ShareOpener />)
    expect(mockPush).toHaveBeenCalledWith('/modals/shared-payment')
  })

  it('opens one that arrives while the app is open', () => {
    render(<ShareOpener />)
    expect(mockPush).not.toHaveBeenCalled()
    act(() => setPendingShare({ text: 'Paid ₹250 to Ramesh' }))
    expect(mockPush).toHaveBeenCalledWith('/modals/shared-payment')
  })

  it('waits out the launch screen', () => {
    mockPath = '/loading'
    setPendingShare({ text: 'Paid ₹250 to Ramesh' })
    render(<ShareOpener />)
    expect(mockPush).not.toHaveBeenCalled()
  })
})
