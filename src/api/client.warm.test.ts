import { AppState } from 'react-native'
import { startConnectionWarmer } from './client'
import { setOnline } from '@/src/lib/netStatus'
import { track } from '@/src/lib/analytics'
jest.mock('@/src/lib/netStatus', () => ({ setOnline: jest.fn(), markSynced: jest.fn() }))
jest.mock('@/src/lib/analytics', () => ({ track: jest.fn() }))

let emit: (state: string) => void
let stop: () => void
let fetchMock: jest.SpyInstance
beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
    emit = cb as (state: string) => void
    return { remove: jest.fn() } as never
  })
  fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}'))
  stop = startConnectionWarmer()
})
afterEach(() => {
  stop()
  jest.restoreAllMocks()
})

it('warms on launch and once per return from the background, with the public status route', () => {
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/system\/status$/)
  expect(fetchMock.mock.calls[0][1]?.headers).toBeUndefined()

  emit('background')
  emit('active')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  // A repeat 'active', or coming back from iOS's 'inactive', is the same foreground.
  emit('active')
  emit('inactive')
  emit('active')
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('a failed warm-up is not an offline signal and is not tracked', async () => {
  fetchMock.mockRejectedValueOnce(new Error('fetch failed'))
  emit('background')
  emit('active')
  await new Promise((r) => setTimeout(r, 0))
  expect(setOnline).not.toHaveBeenCalled()
  expect(track).not.toHaveBeenCalled()
})
