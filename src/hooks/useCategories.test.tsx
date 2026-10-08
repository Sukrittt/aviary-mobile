import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { addCategory, getCategories, moveCategory, updateCategory } from '@/src/api/categories'
import { readCategoryCache, writeCategoryCache } from '@/src/lib/categoryCache'
import { computeEnvelopeState } from '@/src/lib/envelope'
import type { CategoryRow } from '@/src/types'
import { useAddCategory, useCategories, useMoveCategory, useUpdateCategory } from './useCategories'

jest.mock('@/src/api/categories', () => ({
  getCategories: jest.fn(),
  addCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  moveCategory: jest.fn(),
}))

jest.mock('@/src/lib/categoryCache', () => ({
  readCategoryCache: jest.fn(),
  writeCategoryCache: jest.fn(),
}))

const key = ['categories'] as const

function wrapper(queryClient: QueryClient) {
  function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return QueryWrapper
}

const rows: CategoryRow[] = [
  { name: 'Rent', group: 'Home' },
  { name: 'Water', group: 'Home' },
  { name: 'Groceries', group: 'Food' },
]

it('optimistically reorders within the group on mutate', async () => {
  // Held pending (not resolved yet) so the assertion below observes the
  // optimistic write, not the post-settle state — resolved at the end so
  // the mutation actually completes and doesn't leak a pending handle.
  let resolveMove: () => void = () => {}
  ;(moveCategory as jest.Mock).mockImplementation(
    () => new Promise<void>((resolve) => { resolveMove = resolve }),
  )
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  queryClient.setQueryData(key, rows)
  const { result } = renderHook(() => useMoveCategory(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ name: 'Water', toIndex: 0 })

  await waitFor(() => {
    const data = queryClient.getQueryData<CategoryRow[]>(key)
    expect(data?.map((c) => c.name)).toEqual(['Water', 'Rent', 'Groceries'])
  })

  resolveMove()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
})

it('rolls back to the previous list when the mutation errors', async () => {
  ;(moveCategory as jest.Mock).mockRejectedValue(new Error('network error'))
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
  queryClient.setQueryData(key, rows)
  const { result } = renderHook(() => useMoveCategory(), { wrapper: wrapper(queryClient) })

  result.current.mutate({ name: 'Water', toIndex: 0 })

  await waitFor(() => expect(result.current.isError).toBe(true))
  const data = queryClient.getQueryData<CategoryRow[]>(key)
  expect(data?.map((c) => c.name)).toEqual(['Rent', 'Water', 'Groceries'])
})

describe('category cache write-through (offline sync §2)', () => {
  beforeEach(() => jest.clearAllMocks())

  it('a successful fetch writes the cache', async () => {
    ;(getCategories as jest.Mock).mockResolvedValue(rows)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { result } = renderHook(() => useCategories(), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(writeCategoryCache).toHaveBeenCalledWith(rows)
  })

  it('adding a category rewrites the cache', async () => {
    ;(getCategories as jest.Mock).mockResolvedValue(rows)
    ;(addCategory as jest.Mock).mockResolvedValue(undefined)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const categories = renderHook(() => useCategories(), { wrapper: wrapper(queryClient) })
    await waitFor(() => expect(categories.result.current.isSuccess).toBe(true))
    ;(writeCategoryCache as jest.Mock).mockClear()

    const add = renderHook(() => useAddCategory(), { wrapper: wrapper(queryClient) })
    add.result.current.mutate({ name: 'Transport' })

    await waitFor(() => expect(add.result.current.isSuccess).toBe(true))
    // invalidateQueries refetches the active ['categories'] query through the
    // same write-through queryFn, so the mutation itself needs no separate
    // cache-write call.
    await waitFor(() => expect(writeCategoryCache).toHaveBeenCalledWith(rows))
  })

  it('a boot with no network renders the cached list', async () => {
    ;(getCategories as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    // Mirrors app/_layout.tsx hydrating ['categories'] from disk at boot,
    // before any component mounts.
    queryClient.setQueryData(key, rows)
    const { result } = renderHook(() => useCategories(), { wrapper: wrapper(queryClient) })

    expect(result.current.data).toEqual(rows)
    expect(result.current.isSuccess).toBe(true)
  })
})

describe('offline fallback to the cached list', () => {
  beforeEach(() => jest.clearAllMocks())

  it('serves the cached list when the fetch never reaches the server', async () => {
    ;(getCategories as jest.Mock).mockRejectedValue(new TypeError('Network request failed'))
    ;(readCategoryCache as jest.Mock).mockResolvedValue(rows)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { result } = renderHook(() => useCategories(), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(rows)
  })

  it('still errors when the server itself rejects the request', async () => {
    ;(getCategories as jest.Mock).mockRejectedValue(new Error('Failed to load categories: 401'))
    ;(readCategoryCache as jest.Mock).mockResolvedValue(rows)
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const { result } = renderHook(() => useCategories(), { wrapper: wrapper(queryClient) })

    await waitFor(() => expect(result.current.isError).toBe(true))
    // A 401 must reach app/_layout.tsx's query-cache listener, which ends the
    // dead session — swallowing it into the cache would strand the user.
    expect(readCategoryCache).not.toHaveBeenCalled()
  })
})


describe('category rename reconciliation', () => {
  beforeEach(() => jest.clearAllMocks())

  it('preserves Home/widget amounts with every dependent query active and refetch pending', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } })
    const expense = { category: 'Groceries', date: '2026-10-08', amount_inr: '1200', item: 'Groceries' }
    const budgets = [
      { category: '__income__', month: '2026-10', assigned: '10000', rolled_over: '0', version: 1 },
      { category: 'Groceries', month: '2026-10', assigned: '5000', rolled_over: '0', version: 2 },
    ]
    const fixtures: [unknown[], unknown][] = [
      [['categories'], [{ name: 'Groceries', group: 'Food' }]],
      [['budgets'], budgets],
      [['expenses'], [expense]],
      [['expenses', 'recent', '2026-07-01'], { rows: [expense], lastSpent: { Groceries: '2026-10-08' } }],
      [['expenses', 'page', { page: 1 }], { rows: [expense], total: 1 }],
      [['expenses', 'duplicates'], [{ original: expense, duplicate: expense }]],
      [['recurring-expenses'], [{ category: 'Groceries', item: 'Groceries' }]],
      [['bill-scans'], [{ category: 'Groceries', merchant: 'Groceries' }]],
      [['bill-scans', 'bill1'], { category: 'Groceries', items: [{ name: 'Groceries' }] }],
      [['category-map'], { words: { groceries: 'Groceries', rent: 'Rent' } }],
      [['recurring-suggestions', 3], { suggestions: [{ input: { category: 'Groceries' } }] }],
      [['ai-brief', 'INR'], { text: 'Old brief' }],
    ]
    const stops = fixtures.map(([queryKey, data]) => {
      qc.setQueryData(queryKey, data)
      // Hold refetches so a fast server cannot mask a broken local name join.
      const observer = new QueryObserver(qc, { queryKey, queryFn: () => new Promise(() => {}), staleTime: Infinity })
      return observer.subscribe(() => {})
    })
    ;(updateCategory as jest.Mock).mockResolvedValue(undefined)
    const hook = renderHook(() => useUpdateCategory(), { wrapper: wrapper(qc) })
    act(() => hook.result.current.mutate({ name: 'Groceries', updates: { newName: 'Food shopping' } }))

    await waitFor(() => expect(qc.getQueryData<CategoryRow[]>(['categories'])?.[0].name).toBe('Food shopping'))
    const recent = qc.getQueryData<{ rows: unknown[]; lastSpent: Record<string, string> }>(['expenses', 'recent', '2026-07-01'])!
    const state = computeEnvelopeState(qc.getQueryData(['budgets']), recent.rows, '2026-10', qc.getQueryData(['categories']), ['Food'], recent.lastSpent)
    expect(state.readyToAssign).toBe(5000)
    expect(state.envelopes[0]).toMatchObject({ category: 'Food shopping', assigned: 5000, spent: 1200, available: 3800, lastSpentDate: '2026-10-08' })
    for (const [queryKey] of fixtures) expect(qc.getQueryState(queryKey)?.isInvalidated).toBe(true)
    expect(qc.getQueryData(['expenses', 'page', { page: 1 }])).toMatchObject({ rows: [{ category: 'Food shopping', item: 'Groceries' }] })
    expect(qc.getQueryData(['expenses', 'duplicates'])).toMatchObject([{ original: { category: 'Food shopping' }, duplicate: { category: 'Food shopping' } }])
    expect(qc.getQueryData(['recurring-expenses'])).toMatchObject([{ category: 'Food shopping' }])
    expect(qc.getQueryData(['bill-scans'])).toMatchObject([{ category: 'Food shopping' }])
    expect(qc.getQueryData(['bill-scans', 'bill1'])).toMatchObject({ category: 'Food shopping', items: [{ name: 'Groceries' }] })
    expect(qc.getQueryData(['category-map'])).toMatchObject({ words: { groceries: 'Food shopping', rent: 'Rent' } })
    expect(qc.getQueryData(['recurring-suggestions', 3])).toMatchObject({ suggestions: [{ input: { category: 'Food shopping' } }] })
    expect(writeCategoryCache).toHaveBeenCalledWith([{ name: 'Food shopping', group: 'Food' }])
    await act(async () => { await qc.cancelQueries() })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    stops.forEach((stop) => stop())
    qc.clear()
  })

  it.each([{ group: 'Other' }, { newName: 'Groceries' }, { alertPcts: [80] }])('only refreshes categories for a non-rename %j', async (updates) => {
    const qc = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } })
    qc.setQueryData(['budgets'], [])
    ;(updateCategory as jest.Mock).mockResolvedValue(undefined)
    const hook = renderHook(() => useUpdateCategory(), { wrapper: wrapper(qc) })
    await act(async () => { await hook.result.current.mutateAsync({ name: 'Groceries', updates }) })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    expect(qc.getQueryState(['budgets'])?.isInvalidated).toBe(false)
    qc.clear()
  })

  it('leaves cached names and amounts alone when the rename is rejected', async () => {
    const qc = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } })
    qc.setQueryData(['categories'], rows)
    ;(updateCategory as jest.Mock).mockRejectedValue(new Error('duplicate name'))
    const hook = renderHook(() => useUpdateCategory(), { wrapper: wrapper(qc) })
    await act(async () => { await expect(hook.result.current.mutateAsync({ name: 'Groceries', updates: { newName: 'Rent' } })).rejects.toThrow('duplicate name') })
    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(qc.getQueryData(['categories'])).toEqual(rows)
    qc.clear()
  })
})
