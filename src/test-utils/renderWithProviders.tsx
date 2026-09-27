import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react-native'
import { ThemeProvider } from '@/src/theme/ThemeProvider'
import { PrivacyProvider } from '@/src/context/PrivacyContext'

/**
 * Wraps a component in the context layers it actually reads from
 * (QueryClient/Theme/Privacy) — skips app-shell providers from
 * app/_layout.tsx (GestureHandlerRootView, SafeAreaProvider,
 * RootNavigator), which are not a unit test's concern.
 */
export function renderWithProviders(ui: ReactElement, options?: RenderOptions & { queryClient?: QueryClient }) {
  const { queryClient = createTestQueryClient(), ...renderOptions } = options ?? {}
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrivacyProvider>{ui}</PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>,
    renderOptions,
  )
}

/**
 * The client renderWithProviders uses by default. Build one yourself and
 * `setQueryData` on it to render a screen with its data already cached, so
 * nothing the test does can race a query resolving underneath it.
 */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    // Unit-test clients should not keep Jest alive with React Query's
    // production cache-GC timers after the rendered tree is gone.
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  })
}
