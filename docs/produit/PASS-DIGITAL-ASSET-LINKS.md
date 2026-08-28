# Suite Cloudity — Digital Asset Links & passkeys Android

Les apps Android Cloudity (Mail, Drive, Photos, Pass, Calendar, Contacts, Notes, Tasks, Admin) utilisent [Digital Asset Links (DAL)](https://developers.google.com/digital-asset-links/v1/getting-started) pour lier **cryptographiquement** le domaine web (`WEBAUTHN_RP_ID`) et chaque `applicationId` — requis pour **passkeys natives** (Credential Manager, Bitwarden, empreinte).

Pass avait la doc en premier ; depuis **2026-08-28** la même mécanique s’applique à **toute la suite** pour l’auth Cloudity (login compte, pas le déverrouillage coffre Pass).

## Côté web (domaine Cloudity)

Héberger en HTTPS :

`https://<votre-domaine>/.well-known/assetlinks.json`

- **Prod** : fichier embarqué dans `cloudity-web` → `frontend/apps/cloudity-web/.well-known/assetlinks.json`
- **Modèle** : [`infrastructure/nginx/assetlinks.prod.json`](../../infrastructure/nginx/assetlinks.prod.json)
- **Nginx** : `location = /.well-known/assetlinks.json` dans `frontend/apps/cloudity-web/nginx.conf`

Relations par entrée :

- `delegate_permission/common.handle_all_urls`
- `delegate_permission/common.get_login_creds`

Packages Android (2026-08-28) :

| applicationId | App |
|---------------|-----|
| `fr.cloudity.cloudity_mail` | Mail |
| `fr.cloudity.cloudity_drive` | Drive |
| `fr.cloudity.cloudity_photos` | Photos |
| `com.cloudity.cloudity_pass` | Pass |
| `fr.cloudity.cloudity_calendar` | Calendar |
| `fr.cloudity.cloudity_contacts` | Contacts |
| `fr.cloudity.cloudity_notes` | Notes |
| `fr.cloudity.cloudity_tasks` | Tasks |
| `fr.cloudity.admin_app` | Admin |

`sha256_cert_fingerprints` : empreinte SHA-256 du certificat de **signature APK** (debug en dev OTA, release en prod store).

Regénérer après changement de keystore :

```bash
./scripts/mobile/mobile-generate-assetlinks.sh dist/mobile-apk/cloudity_mail-0.1.0.apk
# Met à jour infrastructure/nginx/assetlinks.prod.json
#   et frontend/apps/cloudity-web/.well-known/assetlinks.json
```

## Côté auth-service (WebAuthn)

Variables Portainer / `.env` :

| Variable | Exemple prod |
|----------|----------------|
| `WEBAUTHN_RP_ID` | `cloudity.delhomme.ovh` |
| `WEBAUTHN_ORIGINS` | URLs HTTPS des fronts + `android:apk-key-hash:…` |

**Important** : ces variables doivent être passées au conteneur **`auth-service`** (`docker-compose.ghcr.yml`). Sans elles, le `rpId` reste `localhost` et Bitwarden refuse les passkeys.

Calcul de l’origin Android :

```bash
apksigner verify --print-certs dist/mobile-apk/cloudity_mail-0.1.0.apk
# SHA-256 → base64url → android:apk-key-hash:PPbF...
```

## Côté app Android

Chaque app : intent-filter dans `AndroidManifest.xml` :

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="cloudity.delhomme.ovh" />
</intent-filter>
```

Fragment de référence : `mobile/cloudity_shared/android/dal_intent_filter.xml`

## Vérification

```bash
curl -sS https://cloudity.delhomme.ovh/.well-known/assetlinks.json | jq 'length'   # → 9
curl -sS -X POST https://api.cloudity.delhomme.ovh/auth/webauthn/login/begin-discoverable \
  | jq -r '.options.publicKey.rpId'   # → cloudity.delhomme.ovh

adb shell pm get-app-links fr.cloudity.cloudity_mail
adb shell pm verify-app-links --re-verify fr.cloudity.cloudity_mail
```

## Pass — autofill coffre (historique)

Préférence compte Pass : `pass.digitalAssetLinksEnabled` (défaut `true`) — autofill site ↔ app Pass en plus de l’auth suite.

## Sécurité

DAL **ne remplace pas** le chiffrement E2E Pass. Il atteste que le site et l’app appartiennent au même éditeur.

Voir aussi : [MOBILES.md](MOBILES.md) § 4.1–4.2, [WEBAUTHN-PLAN.md](../securite/WEBAUTHN-PLAN.md).
