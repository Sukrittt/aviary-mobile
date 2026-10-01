import { useMutation } from '@tanstack/react-query'
import { scanBill } from '@/src/api/scan'
import { track } from '@/src/lib/analytics'
import { isAiAllowanceError } from '@/src/lib/aiAllowance'

/** No cache invalidation — a scan reads nothing and writes nothing. */
export function useScanBill() {
  return useMutation({
    mutationFn: scanBill,
    onMutate: () => track('bill_scan_started'),
    // Fires when the OCR came back, not when the expense was saved. Pairing
    // this against expense_logged on /modals/scan-bill is what shows how many
    // scans get abandoned at the review step.
    onSuccess: (result) => track('bill_scanned', { items_count: result.items.length }),
    onError: (err) => track('bill_scan_failed', { reason: isAiAllowanceError(err) ? 'ai_allowance' : 'error' }),
  })
}
