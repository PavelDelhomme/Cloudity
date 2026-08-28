# Matrice de déploiement Cloudity (web · API · mobile)

**Une seule vérité** : clients → **api-gateway** ; images GHCR ; OTA APK via HTTPS `api.*`.

## Qui déploie quoi

| Surface | Comment ça se met à jour | Commande / UI |
|---------|--------------------------|---------------|
| **Web** (shell, mail, drive, admin.html) | Image `cloudity-frontend:latest` | `make push-prod` / `admin-deploy-prod MODE=web` → GitOps + Watchtower |
| **API plateforme** (gateway, auth, admin, mail-directory) | Images `cloudity-*-service:latest` | idem |
| **API produit** (pass, drive, photos, calendar, notes, tasks, contacts) | Images dédiées | idem |
| **Mobile Android** (toutes apps) | Manifeste + APK sur volume `cloudity_mobile_data` | **`/4dm1n` → Déploiements** (upload) ou `make mobile-upload-apk` / `mobile-upload-all` |

## Automatique vs manuel

| Auto (après push `prod`) | Manuel |
|--------------------------|--------|
| Rebuild GHCR (CI) | Build APK Flutter |
| Portainer GitOps (~5 min) si compose change | Upload OTA (UI ou `make`) |
| Watchtower pull `:latest` (~5 min) | Hold / promote release (`/4dm1n`) |

## Depuis `/4dm1n` (navigateur)

1. Ouvre **Déploiements** (`/4dm1n/mobile-distribution`).
2. Vois les versions OTA de **toutes** les apps.
3. **Hold** = masque la release aux téléphones.
4. **Publier OTA** = upload `.apk` + version (JWT admin).
5. Pour le **web/backends** : la page rappelle les commandes `make` (le navigateur **ne** rebuild **pas** GHCR tout seul — sécurité).

## Depuis le PC de dev

```bash
# Tout le socle web+API en prod
make push-prod REF=prod WAIT=1

# Une APK
export MOBILE_APK_UPLOAD_TOKEN=…   # = Portainer stack.env
DEPLOY_URL=https://api.cloudity.delhomme.ovh make mobile-upload-apk APP=Mail

# Toutes les apps mobiles
DEPLOY_URL=https://api.cloudity.delhomme.ovh make mobile-upload-all

# Web puis mobile (APP=all)
DEPLOY_URL=https://api.cloudity.delhomme.ovh APP=all make admin-deploy-prod MODE=all
```

## URLs OTA prod

- Manifeste : `https://api.cloudity.delhomme.ovh/deploy/mobile/manifest?app=cloudity_mail`
- APK : `https://api.cloudity.delhomme.ovh/deploy/apk/cloudity_mail/<version>`
- Liste admin : `GET /admin/mobile/releases`

Docs prod : [`DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md) § 10.1 (conteneurs `Exited`).
