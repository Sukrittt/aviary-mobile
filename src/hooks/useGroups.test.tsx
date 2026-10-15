import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { getGroupIcons, getGroups, moveGroup } from '@/src/api/groups'
import { moveItem } from '@/src/lib/dragReorder'
import { readGroupCache } from '@/src/lib/groupCache'
import { useGroupIcons, useGroups, useMoveGroup } from './useGroups'

jest.mock('@/src/api/groups', () => ({ getGroups: jest.fn(), getGroupIcons: jest.fn(), moveGroup: jest.fn() }))
jest.mock('@/src/lib/groupCache', () => ({ readGroupCache: jest.fn(), writeGroupCache: jest.fn() }))

function deferred() {
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const original = ['House', 'Lifestyle', 'Savings', 'Personal', 'Food']
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  qc.setQueryData(['groups'], original)
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const hook = renderHook(() => ({ groups: useGroups(), first: useMoveGroup(), second: useMoveGroup() }), { wrapper })
  return { qc, ...hook }
}

beforeEach(() => jest.clearAllMocks())

it('saves rapid moves in gesture order and refetches only after the last save', async () => {
  let server = original
  const first = deferred()
  const second = deferred()
  ;(getGroups as jest.Mock).mockImplementation(async () => server)
  ;(moveGroup as jest.Mock)
    .mockImplementationOnce(async (name, to) => { await first.promise; server = moveItem(server, name, to) })
    .mockImplementationOnce(async (name, to) => { await second.promise; server = moveItem(server, name, to) })
  const { result, qc } = setup()
  act(() => result.current.first.mutate({ name: 'House', toIndex: 4 }))
  await waitFor(() => expect(moveGroup).toHaveBeenCalledTimes(1))
  act(() => result.current.second.mutate({ name: 'Food', toIndex: 0 }))
  const expected = ['Food', 'Lifestyle', 'Savings', 'Personal', 'House']
  await waitFor(() => expect(qc.getQueryData(['groups'])).toEqual(expected))
  expect(moveGroup).toHaveBeenCalledTimes(1)
  await act(async () => first.resolve())
  await waitFor(() => expect(moveGroup).toHaveBeenCalledTimes(2))
  expect(getGroups).not.toHaveBeenCalled()
  expect(qc.getQueryData(['groups'])).toEqual(expected)
  await act(async () => second.resolve())
  await waitFor(() => expect(result.current.second.isSuccess).toBe(true))
  expect(server).toEqual(expected)
  expect(qc.getQueryData(['groups'])).toEqual(expected)
  expect(getGroups).toHaveBeenCalledTimes(1)
  qc.clear()
})

it('does not roll back a newer optimistic move when an earlier save fails', async () => {
  const first = deferred()
  const second = deferred()
  let server = original
  ;(getGroups as jest.Mock).mockImplementation(async () => server)
  ;(moveGroup as jest.Mock)
    .mockImplementationOnce(() => first.promise)
    .mockImplementationOnce(async (name, to) => { await second.promise; server = moveItem(server, name, to) })
  const { result, qc } = setup()
  act(() => result.current.first.mutate({ name: 'House', toIndex: 4 }))
  await waitFor(() => expect(moveGroup).toHaveBeenCalledTimes(1))
  act(() => result.current.second.mutate({ name: 'Food', toIndex: 0 }))
  await waitFor(() => expect(qc.getQueryData(['groups'])).toEqual(['Food', 'Lifestyle', 'Savings', 'Personal', 'House']))
  await act(async () => first.reject(new Error('offline')))
  await waitFor(() => expect(result.current.first.isError).toBe(true))
  expect(qc.getQueryData(['groups'])).toEqual(['Food', 'Lifestyle', 'Savings', 'Personal', 'House'])
  expect(getGroups).not.toHaveBeenCalled()
  await act(async () => second.resolve())
  await waitFor(() => expect(result.current.second.isSuccess).toBe(true))
  expect(qc.getQueryData(['groups'])).toEqual(['Food', 'House', 'Lifestyle', 'Savings', 'Personal'])
  qc.clear()
})

it('serves the cached group list when the fetch never reaches the server', async () => {
  ;(getGroups as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
  ;(readGroupCache as jest.Mock).mockResolvedValue(original)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useGroups(), { wrapper })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual(original)
})

it('keeps group icons a Map after the cache is saved to disk and restored', async () => {
  ;(getGroupIcons as jest.Mock).mockResolvedValue([['House', 'House']])
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  // What the persister does on a cold start: JSON out, JSON back in. A cached
  // Map came back as {}, and the picker's groupIcons.get threw on every launch.
  const fetched = await getGroupIcons()
  qc.setQueryData(['groups', 'icons'], JSON.parse(JSON.stringify(fetched)))
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result } = renderHook(() => useGroupIcons(), { wrapper })
  expect(result.current.get('House')).toBe('House')
})
