import { useQuery } from '@tanstack/react-query'
import { getWrapped, getWrappedJudgement, getWrappedStatus } from '@/src/api/wrapped'

export function useWrapped(month?: string) {
  return useQuery({ queryKey: ['wrapped', month] as const, queryFn: () => getWrapped(month), staleTime: 15 * 60_000, retry: 1 })
}

export function useWrappedStatus(enabled = true) {
  return useQuery({ queryKey: ['wrapped-status'] as const, queryFn: getWrappedStatus, staleTime: 15 * 60_000, retry: 1, enabled })
}

export function useWrappedJudgement(month?: string) {
  return useQuery({ queryKey: ['wrapped-judgement', month] as const, queryFn: () => getWrappedJudgement(month), staleTime: 60 * 60_000, retry: false })
}
