import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getUser } from '@/src/api/account'
import { CurrencyScope } from './CurrencyContext'

export function CurrencyProvider({ enabled, initialCurrency = 'INR', children }: { initialCurrency?: string; enabled: boolean; children: ReactNode }) {
  const profile = useQuery({ queryKey: ['user'], queryFn: getUser, enabled, staleTime: 30_000, refetchOnWindowFocus: true })
  return <CurrencyScope code={enabled ? profile.data?.currencyCode ?? initialCurrency : 'INR'}>{children}</CurrencyScope>
}
