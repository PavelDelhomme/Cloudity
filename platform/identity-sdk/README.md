# platform/identity-sdk — Cloudity ID

Clients partagés pour lier **Cloudity Auth** aux apps satellites (YTMusic / PLM, GasoilTracking, JobbingTrack).

**Statut** : squelette TypeScript (pas encore branché en prod).  
Cadrage : [`docs/ecosystem/CLOUDITY-AUTH-PLM.md`](../../docs/ecosystem/CLOUDITY-AUTH-PLM.md)

## Usage prévu

```ts
import { CloudityIdentityClient } from '@cloudity/identity-sdk';

const id = new CloudityIdentityClient({
  authBaseUrl: 'https://auth.example.ovh', // ou URL auth-service
  appId: 'ytmusic',
});

// Opt-in : échanger un access token Cloudity contre un lien app
await id.linkExternalUser({
  cloudityAccessToken: '...',
  externalUserId: plmUser.id,
  email: plmUser.email,
});
```

## Apps

| `appId` | Dossier products |
|---------|------------------|
| `ytmusic` | `products/YTMusic` |
| `gasoil` | `products/GasoilTracking` |
| `jobbingtrack` | `products/jobbing-track` |

Auth locale de chaque app **reste** le défaut tant que `CLOUDITY_SSO_ENABLED` est faux.
