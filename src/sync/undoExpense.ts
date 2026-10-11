import { currentUserId, sessionGeneration, SessionChangedError } from '@/src/api/accessMode'
import { deleteExpense, postExpensePayload } from '@/src/api/expenses'
import { ExpenseWriteError } from '@/src/lib/expenseConflict'
import * as pending from '@/src/lib/pendingExpenses'
import { withExpenseLock } from './expenseLock'

function assertExpenseSession(owner: string | null, generation: number): asserts owner is string {
  if (!owner || owner !== currentUserId() || generation !== sessionGeneration()) throw new SessionChangedError()
}

/** Also handles a POST that committed but whose response was lost. Never mint a new client_id. */
export async function undoPendingExpense(clientId: string, owner: string | null, generation: number): Promise<void> {
  assertExpenseSession(owner, generation)
  if (!clientId) throw new Error('Could not identify this expense. Refresh Activity before undoing.')
  return withExpenseLock(owner, clientId, async () => {
    assertExpenseSession(owner, generation)
    let receipt = await pending.syncReceipt(clientId, owner)
    assertExpenseSession(owner, generation)
    if (!receipt) {
      const entries = [...await pending.list(owner), ...await pending.listFailed(owner)]
      assertExpenseSession(owner, generation)
      const entry = entries.find(e => e.payload.client_id === clientId)
      if (!entry) throw new Error('Could not confirm this expense’s sync status. Refresh Activity before undoing.')
      if (entry.submitted === false) {
        await pending.remove(clientId, owner)
        assertExpenseSession(owner, generation)
        return
      }
      // An attempted (or legacy) entry may already exist remotely. Idempotent
      // replay recovers its identity instead of pretending a local removal undid it.
      const result = await postExpensePayload(entry.payload, generation)
      assertExpenseSession(owner, generation)
      receipt = {
        clientId, ...result, timestamp: result.timestamp ?? entry.payload.timestamp,
        item: entry.payload.item, amountInr: Number(entry.payload.amount_inr),
      }
      await pending.saveSyncReceipt(receipt, owner)
      assertExpenseSession(owner, generation)
    }
    if (!receipt.undone) {
      if (!receipt.id || typeof receipt.version !== 'number' || !Number.isSafeInteger(receipt.version) || receipt.version < 0) {
        throw new Error('Could not confirm this expense’s server version. Refresh Activity before undoing.')
      }
      try {
        await deleteExpense(receipt.id, receipt.timestamp, receipt.item, receipt.amountInr, receipt.version, generation)
      } catch (err) {
        // The DELETE may have succeeded before its response/storage write failed.
        // A 404 for this exact server id confirms that it is already gone.
        if (!(err instanceof ExpenseWriteError && err.status === 404)) throw err
      }
      assertExpenseSession(owner, generation)
      await pending.saveSyncReceipt({ ...receipt, undone: true }, owner)
      assertExpenseSession(owner, generation)
    }
    await pending.remove(clientId, owner)
    assertExpenseSession(owner, generation)
  })
}
