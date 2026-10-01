import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  dismissRecurringSuggestion,
  loadRecurringSuggestions,
  scanRecurringSuggestions,
} from '@/src/api/recurringSuggestions'
import type { RecurringScan, ScanMonths } from '@/src/types/recurringSuggestions'
import { track } from '@/src/lib/analytics'

export const recurringSuggestionsKey = ['recurring-suggestions'] as const

export function useRecurringSuggestions(months: ScanMonths) {
  return useQuery({
    queryKey: [...recurringSuggestionsKey, months],
    queryFn: () => loadRecurringSuggestions(months),
    staleTime: 30_000,
    retry: false,
  })
}

export function useScanRecurringSuggestions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: scanRecurringSuggestions,
    onSuccess: (data, months) => qc.setQueryData([...recurringSuggestionsKey, months], data),
  })
}

function dropSuggestion(qc: QueryClient, id: string) {
  qc.setQueriesData<RecurringScan>({ queryKey: recurringSuggestionsKey }, (old) =>
    old ? { ...old, suggestions: old.suggestions.filter((s) => s.id !== id) } : old,
  )
}

export function useDismissRecurringSuggestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: dismissRecurringSuggestion,
    onSuccess: (_, id) => {
      track('recurring_suggestion_dismissed')
      dropSuggestion(qc, id)
    },
  })
}

/** Called after a suggestion turns into a real recurring expense (modals/recurring-expense.tsx), so it drops out of the list without another scan. */
export function useAcceptRecurringSuggestion() {
  const qc = useQueryClient()
  return (id: string) => {
    track('recurring_suggestion_accepted')
    dropSuggestion(qc, id)
  }
}
