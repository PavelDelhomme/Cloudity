import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiUrl, fetchTenants, fetchUsers, fetchDashboardStats, fetchVaults, createVault, fetchVaultItems, fetchDomains, createDomain, login, register, refreshAuth, moveDriveNode, createDriveFile, createDriveFileWithUniqueName, getDriveNodeContentAsText, putDriveNodeContent, fetchDriveRecentFiles, fetchMailAccounts, syncMailAccount, sendMailMessage } from './api'

describe('api', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('apiUrl', () => {
    it('returns URL that contains the path (relative or absolute)', () => {
      const url = apiUrl('/admin/tenants')
      expect(url).toContain('/admin/tenants')
      expect(apiUrl('admin/tenants')).toContain('/admin/tenants')
    })
    it('returns path for /pass/vaults so request hits API host when base is set', () => {
      expect(apiUrl('/pass/vaults')).toContain('/pass/vaults')
    })
  })

  describe('fetchTenants', () => {
    it('calls GET /admin/tenants with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, name: 'T1', domain: 't1.local' }]),
      } as Response)
      await fetchTenants('my-token')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/tenants'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer my-token',
          }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)
      await expect(fetchTenants('x')).rejects.toThrow(/403/)
    })
  })

  describe('fetchUsers', () => {
    it('calls GET /admin/tenants/:id/users with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as Response)
      await fetchUsers(5, 'token')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/tenants/5/users'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        })
      )
    })
  })

  describe('fetchDashboardStats', () => {
    it('calls GET /admin/stats with Bearer token and returns stats', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ active_tenants: 2, total_users: 5, api_calls_today: 100 }),
      } as Response)
      const result = await fetchDashboardStats('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/stats'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
      expect(result).toEqual({ active_tenants: 2, total_users: 5, api_calls_today: 100 })
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 500 } as Response)
      await expect(fetchDashboardStats('x')).rejects.toThrow(/500/)
    })
  })

  describe('fetchVaults', () => {
    it('calls GET /pass/vaults with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, name: 'Default', user_id: 1, tenant_id: 1, created_at: '', updated_at: '' }]),
      } as Response)
      await fetchVaults('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pass/vaults'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
    })
  })

  describe('fetchVaultItems', () => {
    it('calls GET /pass/vaults/:id/items with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, vault_id: 5, ciphertext: 'enc', created_at: '', updated_at: '' }]),
      } as Response)
      await fetchVaultItems('tk', 5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pass/vaults/5/items'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)
      await expect(fetchVaultItems('x', 1)).rejects.toThrow(/404/)
    })
  })

  describe('createVault', () => {
    it('calls POST /pass/vaults with name', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 2, name: 'My Vault' }),
      } as Response)
      await createVault('tk', 'My Vault')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/pass/vaults'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'My Vault' }),
        })
      )
    })
  })

  describe('fetchDomains', () => {
    it('calls GET /mail/domains with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, tenant_id: 1, domain: 'example.com', is_active: true, created_at: '', updated_at: '' }]),
      } as Response)
      await fetchDomains('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/domains'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)
      await expect(fetchDomains('x')).rejects.toThrow(/401/)
    })
  })

  describe('createDomain', () => {
    it('calls POST /mail/domains with domain', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, domain: 'example.com' }),
      } as Response)
      await createDomain('tk', 'example.com')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/domains'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ domain: 'example.com' }),
        })
      )
    })
  })

  describe('login', () => {
    it('calls POST /auth/login with email, password, tenant_id (default 1)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response)
      await login({ email: 'a@b.com', password: 'p' })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'a@b.com', password: 'p', tenant_id: '1' }),
        })
      )
    })
    it('calls with explicit tenant_id when provided', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response)
      await login({ email: 'a@b.com', password: 'p', tenant_id: 2 })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ email: 'a@b.com', password: 'p', tenant_id: '2' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid credentials'),
      } as Response)
      await expect(login({ email: 'a@b.com', password: 'p' })).rejects.toThrow()
    })
  })

  describe('register', () => {
    it('calls POST /auth/register with email, password, tenant_id as string', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'at', refresh_token: 'rt' }),
      } as Response)
      await register({ email: 'new@b.com', password: 'password123' })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/register'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ email: 'new@b.com', password: 'password123', tenant_id: '1' }),
        })
      )
    })
  })

  describe('refreshAuth', () => {
    it('calls POST /auth/refresh with refresh_token and returns new tokens', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 900 }),
      } as Response)
      const res = await refreshAuth('old_rt')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: 'old_rt' }),
        })
      )
      expect(res).toEqual({ access_token: 'new_at', refresh_token: 'new_rt', expires_in: 900 })
    })
  })

  describe('moveDriveNode', () => {
    it('calls PUT /drive/nodes/:id with parent_id for move', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 10, name: 'Doc', parent_id: 5 }),
      } as Response)
      await moveDriveNode('tk', 10, 5)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes/10'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
          body: JSON.stringify({ parent_id: 5 }),
        })
      )
    })
    it('sends parent_id 0 for move to root', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 10, name: 'Doc', parent_id: null }),
      } as Response)
      await moveDriveNode('tk', 10, null)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ parent_id: 0 }),
        })
      )
    })
  })

  describe('createDriveFile', () => {
    it('calls POST /drive/nodes with is_folder false', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 5, name: 'Doc.docx', is_folder: false }),
      } as Response)
      await createDriveFile('tk', null, 'Doc.docx')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
          body: JSON.stringify({ parent_id: null, name: 'Doc.docx', is_folder: false }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 400 } as Response)
      await expect(createDriveFile('x', 1, 'a.docx')).rejects.toThrow(/400/)
    })
    it('throws with status 409 when file exists', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 409 } as Response)
      const err = await createDriveFile('x', null, 'Sans titre.docx').catch((e) => e)
      expect(err).toBeInstanceOf(Error)
      expect((err as Error & { status?: number }).status).toBe(409)
    })
  })

  describe('createDriveFileWithUniqueName', () => {
    it('returns result when first name is free (GET list then POST create)', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 5, name: 'Doc.docx', is_folder: false }),
        } as Response)
      const result = await createDriveFileWithUniqueName('tk', null, 'Doc.docx')
      expect(result.name).toBe('Doc.docx')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    it('uses "name (1).ext" when base name exists in list', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([{ id: 1, name: 'Sans titre.docx', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null }]),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 6, name: 'Sans titre (1).docx', is_folder: false }),
        } as Response)
      const result = await createDriveFileWithUniqueName('tk', null, 'Sans titre.docx')
      expect(result.name).toBe('Sans titre (1).docx')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
    it('uses next free index when several numbered names exist', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, name: 'Sans titre.docx', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null },
              { id: 2, name: 'Sans titre (1).docx', is_folder: false, parent_id: null, size: 0, tenant_id: 1, user_id: 1, created_at: '', updated_at: '', mime_type: null },
            ]),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 7, name: 'Sans titre (2).docx', is_folder: false }),
        } as Response)
      const result = await createDriveFileWithUniqueName('tk', null, 'Sans titre.docx')
      expect(result.name).toBe('Sans titre (2).docx')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('getDriveNodeContentAsText', () => {
    it('calls GET /drive/nodes/:id/content and returns text', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('hello world'),
      } as Response)
      const result = await getDriveNodeContentAsText('tk', 42)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes/42/content'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
      expect(result).toBe('hello world')
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 404 } as Response)
      await expect(getDriveNodeContentAsText('x', 1)).rejects.toThrow(/404/)
    })
  })

  describe('fetchDriveRecentFiles', () => {
    it('calls GET /drive/nodes/recent with limit and returns array', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, name: 'a.docx', is_folder: false, size: 0, parent_id: null, created_at: '', updated_at: '' }]),
      } as Response)
      const result = await fetchDriveRecentFiles('tk', 15)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/drive\/nodes\/recent\?limit=15/),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer tk' }),
        })
      )
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('a.docx')
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 401 } as Response)
      await expect(fetchDriveRecentFiles('x', 10)).rejects.toThrow(/401/)
    })
  })

  describe('putDriveNodeContent', () => {
    it('calls PUT /drive/nodes/:id/content with body and Content-Type', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 42, size: 11 }),
      } as Response)
      await putDriveNodeContent('tk', 42, 'hello world', 'text/plain')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/drive/nodes/42/content'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            Authorization: 'Bearer tk',
            'Content-Type': 'text/plain',
          }),
          body: 'hello world',
        })
      )
    })
    it('defaults mimeType to text/plain', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 1, size: 0 }),
      } as Response)
      await putDriveNodeContent('tk', 1, '')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'text/plain' }),
        })
      )
    })
    it('throws when response not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, status: 403 } as Response)
      await expect(putDriveNodeContent('x', 1, 'x')).rejects.toThrow(/403/)
    })
  })

  describe('fetchMailAccounts', () => {
    it('calls GET /mail/me/accounts with Bearer token', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 1, email: 'u@example.com', user_id: 1, tenant_id: 1, created_at: '', updated_at: '' }]),
      } as Response)
      await fetchMailAccounts('tk')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/me/accounts'),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tk' }) })
      )
    })
  })

  describe('syncMailAccount', () => {
    it('calls POST /mail/me/accounts/:id/sync with password', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ synced: 5, message: 'synchronisation terminée' }),
      } as Response)
      await syncMailAccount('tk', 1, 'secret')
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/me/accounts/1/sync'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer tk', 'Content-Type': 'application/json' }),
        })
      )
      const callBody = JSON.parse((mockFetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
      expect(callBody.password).toBe('secret')
    })
    it('throws with error message when not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false, text: () => Promise.resolve(JSON.stringify({ error: 'identifiants invalides' })) } as Response)
      await expect(syncMailAccount('x', 1, 'p')).rejects.toThrow(/identifiants invalides/)
    })
  })

  describe('sendMailMessage', () => {
    it('calls POST /mail/me/send with account_id, password, to, subject, body', async () => {
      const mockFetch = vi.mocked(fetch)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ message: 'message envoyé' }),
      } as Response)
      await sendMailMessage('tk', {
        account_id: 1,
        password: 'pass',
        to: 'dest@example.com',
        subject: 'Test',
        body: 'Hello',
      })
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mail/me/send'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            account_id: 1,
            password: 'pass',
            to: 'dest@example.com',
            subject: 'Test',
            body: 'Hello',
          }),
        })
      )
    })
  })
})
