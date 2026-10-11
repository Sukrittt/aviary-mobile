import { setOnline, isOnline } from './netStatus'

beforeEach(() => {
  // Reset to the module's default state before each test.
  setOnline(true)
})

describe('setOnline', () => {
  it('does not flip offline on a single failure', () => {
    setOnline(false)
    expect(isOnline()).toBe(true)
  })

  it('flips offline after two consecutive failures with no success between', () => {
    setOnline(false)
    setOnline(false)
    expect(isOnline()).toBe(false)
  })

  it('a success between two failures resets the streak, so the next single failure does not flip offline', () => {
    setOnline(false)
    setOnline(true)
    setOnline(false)
    expect(isOnline()).toBe(true)
  })

  it('a success always flips back online immediately and resets the streak', () => {
    setOnline(false)
    setOnline(false)
    expect(isOnline()).toBe(false)

    setOnline(true)
    expect(isOnline()).toBe(true)

    // Streak was reset, so a single failure right after recovery still shouldn't flip it.
    setOnline(false)
    expect(isOnline()).toBe(true)
  })
})

describe('setOnline with a probe', () => {
  const flush = () => new Promise((r) => setImmediate(r))

  it('stays online when the probe still reaches the server (a blip, not an outage)', async () => {
    const probe = jest.fn().mockResolvedValue(false)
    setOnline(false, probe)
    setOnline(false, probe)
    await flush()
    expect(probe).toHaveBeenCalledTimes(1)
    expect(isOnline()).toBe(true)
    // The streak was cleared, so one more failure doesn't flip it either.
    setOnline(false, probe)
    expect(isOnline()).toBe(true)
  })

  it('goes offline when the probe confirms the server is unreachable', async () => {
    const probe = jest.fn().mockResolvedValue(true)
    setOnline(false, probe)
    setOnline(false, probe)
    expect(isOnline()).toBe(true)
    await flush()
    expect(isOnline()).toBe(false)
  })

  it('a success landing while the probe runs wins', async () => {
    let settle: (offline: boolean) => void = () => {}
    const probe = jest.fn(() => new Promise<boolean>((r) => (settle = r)))
    setOnline(false, probe)
    setOnline(false, probe)
    setOnline(false, probe)
    expect(probe).toHaveBeenCalledTimes(1)
    setOnline(true)
    settle(true)
    await flush()
    expect(isOnline()).toBe(true)
  })
})
