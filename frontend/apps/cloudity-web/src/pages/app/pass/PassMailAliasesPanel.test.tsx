import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TestRouter } from '../../../test-utils'
import PassMailAliasesPanel from './PassMailAliasesPanel'
import * as api from '../../../api'

vi.mock('../../../api', () => ({
  fetchMailAccounts: vi.fn(),
  fetchMailAliases: vi.fn(),
  fetchMailAliasConfig: vi.fn(),
  createMailAlias: vi.fn(),
  patchMailAlias: vi.fn(),
  deleteMailAlias: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TestRouter>{ui}</TestRouter>
    </QueryClientProvider>
  )
}

describe('PassMailAliasesPanel', () => {
  beforeEach(() => {
    vi.mocked(api.fetchMailAccounts).mockReset()
    vi.mocked(api.fetchMailAliases).mockReset()
    vi.mocked(api.fetchMailAliasConfig).mockReset()
    vi.mocked(api.createMailAlias).mockReset()
    vi.mocked(api.patchMailAlias).mockReset()
    vi.mocked(api.deleteMailAlias).mockReset()
    vi.mocked(api.fetchMailAliasConfig).mockResolvedValue({
      alias_subdomain: '',
      primary_domain: '',
    })
  })

  it('invite à connecter Mail quand aucun compte', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([])
    wrap(<PassMailAliasesPanel accessToken="tok" logout={vi.fn()} />)
    expect(await screen.findByText(/Aucune boîte mail reliée/i)).toBeTruthy()
  })

  it('affiche les alias pour la boîte sélectionnée', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        tenant_id: 1,
        email: 'a@b.com',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    vi.mocked(api.fetchMailAliases).mockResolvedValue([
      {
        id: 10,
        account_id: 1,
        alias_email: 'alias@b.com',
        label: 'L',
        deliver_target_email: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    ])
    wrap(<PassMailAliasesPanel accessToken="tok" logout={vi.fn()} />)
    expect(await screen.findByText('alias@b.com')).toBeTruthy()
    expect((screen.getByLabelText(/^Boîte$/i) as HTMLSelectElement).value).toBe('1')
  })

  it('enregistre un alias via createMailAlias avec suffixe domaine', async () => {
    vi.mocked(api.fetchMailAccounts).mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        tenant_id: 1,
        email: 'a@b.com',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ])
    vi.mocked(api.fetchMailAliases).mockResolvedValue([])
    vi.mocked(api.fetchMailAliasConfig).mockResolvedValue({
      alias_subdomain: 'alias.b.com',
      primary_domain: 'b.com',
    })
    vi.mocked(api.createMailAlias).mockResolvedValue({ id: 99, alias_email: 'newsletter@alias.b.com' })

    wrap(<PassMailAliasesPanel accessToken="tok" logout={vi.fn()} />)

    const local = await screen.findByLabelText(/Nom de l’alias/i)
    fireEvent.change(local, { target: { value: 'newsletter' } })
    fireEvent.click(screen.getByRole('button', { name: /Enregistrer l’alias/i }))

    await waitFor(() => {
      expect(api.createMailAlias).toHaveBeenCalledWith('tok', 1, {
        alias_email: 'newsletter@alias.b.com',
        label: undefined,
        deliver_target_email: undefined,
      })
    })
  })
})
