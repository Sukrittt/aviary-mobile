import { fetchNudgeCopy } from './habitNudges'
import { apiFetch } from './client'

jest.mock('./client', () => ({ apiFetch: jest.fn() }))

const habit = { item: 'Football', category: 'Fun', weekdays: [1, 3, 5], minute: 1140 }
const reply = (body: unknown, ok = true) => jest.mocked(apiFetch).mockResolvedValueOnce({ ok, json: async () => body } as Response)

describe('fetchNudgeCopy', () => {
  it('keeps only usable body lines', async () => {
    reply({ title: 'Football night?', bodies: ['Log it.', 3, '', null, 'Boots on?'] })
    expect(await fetchNudgeCopy(habit)).toEqual({ title: 'Football night?', bodies: ['Log it.', 'Boots on?'] })
  })

  it('gives up on a malformed or failed reply', async () => {
    reply({ title: 'Hi?', bodies: [1, 2] })
    expect(await fetchNudgeCopy(habit)).toBeNull()
    reply({ title: '', bodies: ['ok'] })
    expect(await fetchNudgeCopy(habit)).toBeNull()
    reply({}, false)
    expect(await fetchNudgeCopy(habit)).toBeNull()
    jest.mocked(apiFetch).mockRejectedValueOnce(new Error('offline'))
    expect(await fetchNudgeCopy(habit)).toBeNull()
  })
})
