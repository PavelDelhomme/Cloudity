/** Identifiants d’apps satellites (doit matcher identity_app_links.app_id). */
export type CloudityAppId = 'ytmusic' | 'gasoil' | 'jobbingtrack';

export type IdentityLinkRequest = {
  cloudityAccessToken: string;
  externalUserId: string;
  email: string;
};

export type IdentityLinkResult = {
  linked: boolean;
  cloudityUserId?: string;
  appId: CloudityAppId;
  externalUserId: string;
};

export type CloudityIdentityClientOptions = {
  /** Base URL de auth-service Cloudity (sans slash final). */
  authBaseUrl: string;
  appId: CloudityAppId;
  /** Feature flag client — si false, les appels no-op / throw contrôlé. */
  enabled?: boolean;
  fetchImpl?: typeof fetch;
};

function normalizeEmail(email: string): string {
  return String(email || '')
    .toLowerCase()
    .trim();
}

/**
 * Client HTTP minimal pour le lien Cloudity ↔ user app.
 * Les routes réelles arrivent en phase 2 (voir CLOUDITY-AUTH-PLM.md).
 */
export class CloudityIdentityClient {
  private readonly authBaseUrl: string;
  private readonly appId: CloudityAppId;
  private readonly enabled: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: CloudityIdentityClientOptions) {
    this.authBaseUrl = opts.authBaseUrl.replace(/\/$/, '');
    this.appId = opts.appId;
    this.enabled = opts.enabled !== false;
    this.fetchImpl = opts.fetchImpl || fetch;
  }

  /** Échange token Cloudity + identité app → enregistrement du lien (IdP). */
  async linkExternalUser(req: IdentityLinkRequest): Promise<IdentityLinkResult> {
    if (!this.enabled) {
      return {
        linked: false,
        appId: this.appId,
        externalUserId: req.externalUserId,
      };
    }
    const email = normalizeEmail(req.email);
    if (!email || !req.externalUserId || !req.cloudityAccessToken) {
      throw new Error('linkExternalUser: email, externalUserId et token requis');
    }
    const res = await this.fetchImpl(`${this.authBaseUrl}/auth/identity/link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${req.cloudityAccessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        app_id: this.appId,
        external_user_id: String(req.externalUserId),
        email,
      }),
    });
    if (res.status === 404) {
      // Route pas encore déployée — soft fail pour ne pas casser PLM
      return { linked: false, appId: this.appId, externalUserId: req.externalUserId };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`identity link failed: HTTP ${res.status} ${body}`);
    }
    const data = (await res.json()) as { cloudity_user_id?: string | number };
    return {
      linked: true,
      cloudityUserId: data.cloudity_user_id != null ? String(data.cloudity_user_id) : undefined,
      appId: this.appId,
      externalUserId: req.externalUserId,
    };
  }
}

export { normalizeEmail };
