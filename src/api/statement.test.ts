import { apiFetch } from './client'
import { readStatement } from './statement'

jest.mock('./client', () => ({ apiFetch: jest.fn() }))
jest.mock('expo-file-system', () => ({ File: function MockFile() { return new Blob(['%PDF']) } }))

const images = { images: [{ data: 'abc', mimeType: 'image/jpeg' }] }
const answer = (status: number, body: unknown) =>
  (apiFetch as jest.Mock).mockResolvedValueOnce({ ok: false, status, json: async () => body, clone() { return this } })

it('words a statement in another currency', async () => {
  answer(422, { error: 'other_currency' })
  await expect(readStatement(images)).rejects.toThrow("These payments are in a different currency from your budget, so nothing was added. Try a statement or screenshot from the account you budget in.")
})

it('titles a known failure, and falls back to a plain title otherwise', async () => {
  answer(422, { error: 'pdf_locked' })
  await expect(readStatement(images)).rejects.toMatchObject({ title: 'That PDF is locked' })
  answer(500, { error: 'Mongo exploded' })
  await expect(readStatement(images)).rejects.toMatchObject({ title: "That didn't go through" })
})

it('names a locked pdf by code, and sends a password with the file only when there is one', async () => {
  answer(400, { error: 'pdf_password_wrong' })
  await expect(readStatement(images)).rejects.toMatchObject({ code: 'pdf_password_wrong', message: "That didn't open it, try again." })
  const forms: FormData[] = []
  ;(apiFetch as jest.Mock).mockImplementation(async (_: string, init: RequestInit) => {
    forms.push(init.body as FormData)
    return { ok: true, json: async () => ({ id: 'p', items: [], credits: 0, dropped: 0 }) }
  })
  const file = { uri: 'file:///hdfc.pdf', name: 'hdfc.pdf' }
  await readStatement({ file, password: '01011990' })
  await readStatement({ file })
  expect(forms[0].get('password')).toBe('01011990')
  expect(forms[1].getAll('password')).toEqual([])
  ;(apiFetch as jest.Mock).mockReset()
})

it('falls back to generic copy for a code it does not know, never the raw text', async () => {
  answer(500, { error: 'Mongo exploded' })
  await expect(readStatement(images)).rejects.toThrow('Check your connection and try again.')
})
