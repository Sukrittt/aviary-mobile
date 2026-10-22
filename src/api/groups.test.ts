import { apiFetch } from './client'
import { addGroup, getGroupIcons, getGroups } from './groups'

jest.mock('./client', () => ({ apiFetch: jest.fn(), apiErrorMessage: jest.fn() }))

const rows = [{ name: 'House', icon: 'House' }, { name: 'Food' }]
const ok = () => ({ ok: true, json: async () => rows })

beforeEach(() => jest.clearAllMocks())

it('serves the names and the icons from one request when both load together', async () => {
  ;(apiFetch as jest.Mock).mockResolvedValue(ok())
  const [names, icons] = await Promise.all([getGroups(), getGroupIcons()])
  expect(names).toEqual(['House', 'Food'])
  expect(icons).toEqual([['House', 'House']])
  expect(apiFetch).toHaveBeenCalledTimes(1)
  expect(apiFetch).toHaveBeenCalledWith('/api/groups?icons=1')
})

it('asks again once the shared request has settled, including after a failure', async () => {
  ;(apiFetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValue(ok())
  await expect(getGroups()).rejects.toThrow('Failed to load groups: 503')
  expect(await getGroups()).toEqual(['House', 'Food'])
  expect(apiFetch).toHaveBeenCalledTimes(2)
})

it('saves a picked icon and colour right after creating the group', async () => {
  ;(apiFetch as jest.Mock).mockResolvedValue({ ok: true })
  await addGroup('Pets', { icon: 'PawPrint', color: 'mint' })
  expect(apiFetch).toHaveBeenCalledTimes(2)
  expect(JSON.parse((apiFetch as jest.Mock).mock.calls[0][1].body)).toEqual({ name: 'Pets' })
  expect((apiFetch as jest.Mock).mock.calls[1][1].method).toBe('PUT')
  expect(JSON.parse((apiFetch as jest.Mock).mock.calls[1][1].body)).toEqual({ name: 'Pets', icon: 'PawPrint', color: 'mint' })
})

it('creates a group in one request when nothing was picked', async () => {
  ;(apiFetch as jest.Mock).mockResolvedValue({ ok: true })
  await addGroup('Pets')
  expect(apiFetch).toHaveBeenCalledTimes(1)
})
