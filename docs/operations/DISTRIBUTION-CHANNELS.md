# Canaux de distribution Cloudity

Stratégie multi-canal pour installer et mettre à jour les applications (web, mobile, desktop).

---

## 1. Vue d'ensemble

| Canal | Cible | Statut | Commande / doc |
|-------|--------|--------|----------------|
| **Web PWA** | Navigateur | ✅ Prod via GHCR + Watchtower | `make push-prod` |
| **OTA APK** | Android sideload | ✅ Prod HTTPS + UI admin | `make mobile-upload-apk` / `mobile-upload-all` · `/4dm1n` → Déploiements |
| **F-Droid** | Android libre | 📋 Métadonnées stub | `deploy/fdroid/` |
| **Google Play** | Android store | 📋 Checklist manuelle | § 4 ci-dessous |
| **TestFlight** | iOS | 📋 Compte Apple requis | § 5 |
| **Linux desktop** | .deb / Flatpak | 📋 Plan | `DISTRIBUTION-LINUX-DESKTOP.md` |

Version source : [`VERSION`](../VERSION) — affichage **`d+`** (dev) / **`p+`** (prod).

---

## 2. OTA self-hosted (Android) — URLs sécurisées

| Env | Gateway | Manifeste / APK |
|-----|---------|-----------------|
| **Local** | `http://127.0.0.1:6002` (+ `adb reverse`) | `GET /deploy/mobile/manifest?app=…` · `GET /deploy/apk/…` |
| **Dev / LAN** | `http://192.168.x.x:6002` | idem |
| **Préprod** | `https://api.*-preprod.…` | TLS |
| **Prod** | `https://api.cloudity.delhomme.ovh` | TLS via NPM |

Stockage : volume **`cloudity_mobile_data`** (`MOBILE_RELEASE_DIR`). Upload : `POST /deploy/mobile/upload` + `MOBILE_APK_UPLOAD_TOKEN` (ou JWT admin sur `/admin/mobile/apk/upload`).

### Build & publier

```bash
# Une app
MOBILE_APK_UPLOAD_TOKEN=… DEPLOY_URL=https://api.cloudity.delhomme.ovh \
  make mobile-upload-apk APP=Mail

# Toutes (Mail Drive Photos Pass Calendar Contacts Notes Tasks)
DEPLOY_URL=https://api.cloudity.delhomme.ovh make mobile-upload-all

# Ou depuis le navigateur admin (JWT) : /4dm1n → Déploiements → Publier OTA
```

Fichiers locaux :

- `dist/mobile-apk/cloudity_mail-X.Y.Z.apk`
- `dist/mobile-manifests/version-cloudity_mail.json`

Format manifeste (aussi servi par la gateway) :

```json
{
  "app": "cloudity_mail",
  "version": "0.1.0",
  "min_supported": "0.1.0",
  "apk_url": "https://api.cloudity.delhomme.ovh/deploy/apk/cloudity_mail/0.1.0",
  "sha256": "…",
  "published_at": "2026-08-19T12:00:00Z"
}
```

### Côté app Flutter

Au login / restore : `SuiteAppShell` (ou Pass maison) → `CloudityOtaClient.checkUpdate` → dialogue si version serveur > installée → ouvre `apk_url` HTTPS.

| Action | Endpoint |
|--------|----------|
| Liste releases (UI admin) | `GET /admin/mobile/releases` |
| Upload JWT admin | `POST /admin/mobile/apk/upload` |
| Hold | `POST /admin/mobile/apk/hold?app=cloudity_mail&held=true` |
| Upload token CI | `POST /deploy/mobile/upload` + `MOBILE_APK_UPLOAD_TOKEN` |

Matrice web/API/mobile : [`DEPLOY-MATRIX.md`](DEPLOY-MATRIX.md).
---

## 3. F-Droid

Répertoire [`deploy/fdroid/`](../deploy/fdroid/) :

- `README.md` — procédure soumission
- `metadata/fr.cloudity.cloudity_mail.yml` — stub Fastlane/F-Droid

F-Droid exige :

- Code source public (GitHub ✅)
- Build reproductible (`flutter build apk` avec tag Git)
- Pas de dépendance Google Play Services obligatoire

---

## 4. Google Play Store

Checklist (manuelle) :

1. Compte Play Console (~25 USD one-time)
2. Keystore release **hors Git** (backup chiffré)
3. `flutter build appbundle --release` par app
4. Privacy policy URL publique
5. Data safety form
6. Internal testing → closed → production

Packages Android :

| App | Package |
|-----|---------|
| Mail | `fr.cloudity.cloudity_mail` |
| Drive | `fr.cloudity.cloudity_drive` |
| Photos | `fr.cloudity.cloudity_photos` |
| Pass | `fr.cloudity.cloudity_pass` |

Flavors recommandés : `dev` (`.dev` suffix) / `prod` (store).

---

## 5. iOS (TestFlight)

Sans compte Apple Developer (~99 USD/an) : **pas de distribution OTA** type APK.

Options :

- **TestFlight** : builds Xcode + upload Transporter
- **MDM entreprise** : usage interne uniquement

---

## 6. Web — pas d'« OTA »

Nouvelle image `cloudity-frontend` → Watchtower → rechargement navigateur (cache bust Vite).

---

## 7. Bump version

```bash
make bump-patch    # 0.1.0 → 0.1.1
make bump-minor
make bump-major
make admin-deploy-prod MODE=all   # web + mobile après bump
```

`versionCode` Android = `major×10000 + minor×100 + patch`.
