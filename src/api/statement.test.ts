import { apiFetch } from './client'
import { readStatement } from './statement'

jest.mock('./client', () => ({ apiFetch: jest.fn() }))

const images = { images: [{ data: 'abc', mimeType: 'image/jpeg' }] }
const answer = (status: number, body: unknown) =>
  (apiFetch as jest.Mock).mockResolvedValueOnce({ ok: false, status, json: async () => body, clone() { return this } })

it('words a statement in another currency', async () => {
  answer(422, { error: 'other_currency' })
  await expect(readStatement(images)).rejects.toThrow("These payments are in a different currency from your budget, so nothing was added. Try a statement or screenshot from the account you budget in.")
})

it('falls back to generic copy for a code it does not know, never the raw text', async () => {
  answer(500, { error: 'Mongo exploded' })
  await expect(readStatement(images)).rejects.toThrow('Check your connection and try again.')
})
