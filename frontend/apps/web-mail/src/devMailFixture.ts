/**
 * Boîte locale sans session Hubera ID. Uniquement en `vite` (import.meta.env.DEV)
 * et seulement si l’URL contient `?fixture=1`. Aucun mot de passe, aucun compte réel.
 */
const NOW = new Date().toISOString()

const MESSAGES = [
  {
    id: 7,
    account_id: 1,
    folder: 'inbox',
    from: 'atelier@example.test',
    to: 'lecture@example.test',
    subject: 'Compte rendu du matin',
    date_at: NOW,
    created_at: NOW,
    is_read: false,
    spam_score: 0,
    thread_key: 'thread-matin',
    attachment_count: 1,
    tag_ids: [],
  },
  {
    id: 8,
    account_id: 1,
    folder: 'inbox',
    from: 'notes@example.test',
    to: 'lecture@example.test',
    subject: 'Note sans fichier',
    date_at: NOW,
    created_at: NOW,
    is_read: true,
    spam_score: 0,
    thread_key: 'thread-note',
    attachment_count: 0,
    tag_ids: [],
  },
]

const DETAIL = {
  ...MESSAGES[0],
  body_plain: 'Compte rendu du matin. Le fichier ordre-du-jour est joint à ce message.',
  body_html: '',
  raw_headers: '',
  attachments: [
    {
      id: 1,
      filename: 'ordre-du-jour.pdf',
      content_type: 'application/pdf',
      size_bytes: 2048,
      stored_inline: true,
    },
  ],
}

function b64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fixtureToken(): string {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({ exp, user_id: 1, tenant_id: 1 })}.local`
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fixtureBody(path: string): unknown {
  if (path.includes('/auth/me/preferences')) {
    return {
      preferences: {
        theme: { default: 'light', apps: { mail: 'light' } },
        pass: {
          clipboardEnabled: true,
          clipboardClearMs: 30000,
          totpAutoCopy: false,
          digitalAssetLinksEnabled: true,
          autoLockMs: 300000,
        },
      },
    }
  }
  if (path.includes('/folders/summary')) {
    const empty = { total: 0, unread: 0 }
    return {
      inbox: { total: 2, unread: 1 },
      sent: empty,
      drafts: empty,
      archive: empty,
      spam: empty,
      trash: empty,
      extra: [],
    }
  }
  if (/\/messages\/\d+/.test(path)) {
    const id = Number(path.match(/\/messages\/(\d+)/)?.[1] ?? 7)
    if (id === 8) {
      return {
        ...MESSAGES[1],
        body_plain: 'Note sans fichier. Rien n’est joint.',
        body_html: '',
        attachments: [],
      }
    }
    return DETAIL
  }
  if (path.includes('/messages')) return { messages: MESSAGES, total: MESSAGES.length }
  if (path.endsWith('/accounts') || path.includes('/mail/me/accounts') && !path.includes('/accounts/')) {
    return [
      {
        id: 1,
        user_id: 1,
        tenant_id: 1,
        email: 'lecture@example.test',
        label: 'Lecture',
        imap_auth_ready: false,
        created_at: NOW,
        updated_at: NOW,
      },
    ]
  }
  if (path.includes('/contacts')) return []
  return { ok: true }
}

export function installDevMailFixture(): void {
  if (!import.meta.env.DEV) return
  if (new URLSearchParams(window.location.search).get('fixture') !== '1') return
  try {
    localStorage.setItem(
      'cloudity_admin_auth',
      JSON.stringify({
        accessToken: fixtureToken(),
        refreshToken: null,
        tenantId: 1,
        email: 'lecture@example.test',
      })
    )
  } catch {
    /* navigation privée */
  }
  const orig = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = raw.replace(/^https?:\/\/[^/]+/, '')
    if (
      path.startsWith('/mail') ||
      path.startsWith('/auth') ||
      path.startsWith('/contacts') ||
      path.startsWith('/drive') ||
      path.startsWith('/pass')
    ) {
      return json(fixtureBody(path))
    }
    return orig(input, init)
  }
}
