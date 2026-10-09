import { refreshTokens } from './workos'

afterEach(() => {
  jest.restoreAllMocks()
})

// Every apiFetch awaits getValidToken(), which awaits this refresh. A refresh
// that never settles used to stall every API call in the app until a relaunch:
// nothing reached the server, and apiFetch's own timeout never started.
it('gives up on a hung token refresh instead of waiting forever', async () => {
  const timers: { ms: number; controller: AbortController }[] = []
  jest.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
    const controller = new AbortController()
    timers.push({ ms, controller })
    return controller.signal
  })
  jest.spyOn(global, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The signal timed out.')))
      }),
  )

  const refresh = refreshTokens('r1')
  expect(timers).toHaveLength(1)
  expect(timers[0].ms).toBeLessThanOrEqual(15_000)
  timers[0].controller.abort()

  await expect(refresh).rejects.toThrow('The signal timed out.')
})
