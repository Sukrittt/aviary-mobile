import { act, renderHook, waitFor } from '@testing-library/react-native'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createTestQueryClient } from '@/src/test-utils/renderWithProviders'
import { claimChangelog, getLatestChangelog, type ChangelogRelease } from '@/src/api/changelog'
import { getWeekRecap } from '@/src/api/weekRecap'
import { currentUserId } from '@/src/api/accessMode'
import { weekRecapKey } from '@/src/features/week-recap/useWeekRecap'
import { changelogKey, shownRelease, useChangelogGate } from './useChangelogGate'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (p: string) => mockPush(p) } }))
jest.mock('@/src/api/changelog', () => ({ getLatestChangelog: jest.fn(), claimChangelog: jest.fn() }))
jest.mock('@/src/api/weekRecap', () => ({ getWeekRecap: jest.fn(), markWeekRecapSeen: jest.fn() }))
jest.mock('@/src/api/accessMode', () => ({ currentUserId: jest.fn() }))
jest.mock('@/app.json', () => ({ expo: { version: '2.6.0' } }))

const release: ChangelogRelease = {
  id: 'r3', platform: 'mobile', title: 'Log faster', version: 'v2.6.0', highlights: ['Quick capture'], body: '', publishedAt: '2026-10-08T00:00:00.000Z',
}

function renderGate() {
  const client = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  return { client, ...renderHook(() => useChangelogGate(), { wrapper }) }
}

/** Both queries loaded and the gate's effect has had its chance to claim. */
async function settled(client: ReturnType<typeof createTestQueryClient>) {
  await waitFor(() => {
    expect(client.getQueryState(changelogKey)?.status).toBe('success')
    expect(client.getQueryState(weekRecapKey)?.status).toBe('success')
  })
  await act(async () => {})
}

let user = 0
beforeEach(() => {
  jest.clearAllMocks()
  // A fresh account per test: the gate remembers claims per account for the session.
  ;(currentUserId as jest.Mock).mockReturnValue(`user_${++user}`)
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: false })
  ;(getLatestChangelog as jest.Mock).mockResolvedValue(release)
  ;(claimChangelog as jest.Mock).mockResolvedValue(release)
})

it('claims the newest release and opens What\'s new once', async () => {
  const { unmount } = renderGate()
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/whats-new'))
  expect(claimChangelog).toHaveBeenCalledWith('r3')
  expect(shownRelease()).toEqual(release)
  unmount()

  renderGate()
  await waitFor(() => expect(getLatestChangelog).toHaveBeenCalledTimes(2))
  await act(async () => {})
  expect(claimChangelog).toHaveBeenCalledTimes(1)
  expect(mockPush).toHaveBeenCalledTimes(1)
})

it('opens nothing when another device claimed it first', async () => {
  ;(claimChangelog as jest.Mock).mockResolvedValue(null)
  const { client } = renderGate()
  await waitFor(() => expect(claimChangelog).toHaveBeenCalled())
  await waitFor(() => expect(client.getQueryData(['changelog', 'mobile'])).toBeNull())
  expect(mockPush).not.toHaveBeenCalled()
})

it('waits for the first-week recap instead of stacking on it', async () => {
  ;(getWeekRecap as jest.Mock).mockResolvedValue({ due: true, recap: {} })
  const { client } = renderGate()
  await settled(client)
  expect(claimChangelog).not.toHaveBeenCalled()
  // Recap seen: its cached flag drops, and What's new follows.
  act(() => client.setQueryData(weekRecapKey, { due: false }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/whats-new'))
})

it('waits for an app update when the release is for a newer version', async () => {
  ;(getLatestChangelog as jest.Mock).mockResolvedValue({ ...release, version: 'v2.7.0' })
  const { client } = renderGate()
  await settled(client)
  expect(claimChangelog).not.toHaveBeenCalled()
})

it('opens nothing when there is no unseen release', async () => {
  ;(getLatestChangelog as jest.Mock).mockResolvedValue(null)
  const { client } = renderGate()
  await settled(client)
  expect(claimChangelog).not.toHaveBeenCalled()
})
