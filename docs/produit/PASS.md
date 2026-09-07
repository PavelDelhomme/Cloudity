# Pass Cloudity (fiche produit unique)

> Crypto détaillée : [`../securite/PASS-CRYPTO.md`](../securite/PASS-CRYPTO.md).  
> Anciens `PASS.md`, `PASS.md`, `PASS.md` → stubs.

## Sommaire

1. [Sauvegarde](#1-sauvegarde)
2. [Digital Asset Links / passkeys](#2-digital-asset-links--passkeys)
3. [Sprint archive](#3-sprint-archive-2026-05)

---

# 1. Sauvegarde

## Cloudity Pass — sauvegarde, restauration et mode hors ligne

> **Objectif** : ne jamais bloquer l’accès au coffre pour la seule raison qu’il n’y a pas de réseau ou que le cloud est temporairement injoignable — contrairement à KeePassXC + sync cloud quand le fichier distant est corrompu ou absent.

## Modèle à trois niveaux

| Niveau | Rôle | Où | Contenu |
|--------|------|-----|---------|
| **1. Cloud (distant)** | Source de vérité multi-appareils | Postgres `pass_vaults` / `pass_items` | Blobs `ciphertext` uniquement (zero-access) |
| **2. Fichier exporté** | Backup portable / archivage | Web : `cloudity-pass-backup-*.json` | Même blobs chiffrés + métadonnées coffres |
| **3. Cache local appareil** | Lecture hors ligne | Mobile : `Documents/cloudity_pass_backup_<userId>.json` | Snapshot automatique après sync réussie |

Le **mot de passe maître** et la **biométrie** restent **locaux** : le serveur ne peut ni déchiffrer ni restaurer un maître oublié.

---

## Format `cloudity-pass-backup-v1`

Fichier JSON (extension `.json`) :

```json
{
  "schema": "cloudity-pass-backup-v1",
  "exported_at": "2026-07-07T12:00:00.000Z",
  "user_id": "50",
  "app": "cloudity-pass",
  "vaults": [
    {
      "id": 1,
      "name": "Perso",
      "items": [
        {
          "id": 42,
          "ciphertext": "<base64url EnvelopeV1>",
          "format_version": 1
        }
      ]
    }
  ]
}
```

- **Aucun secret en clair** : seuls des ciphertexts client-side.
- Validation : `@cloudity/pass-crypto` (`parsePassBackupJson`) et miroir Dart `PassLocalBackupStore`.
- Spec crypto des blobs : [PASS-CRYPTO.md](../securite/PASS-CRYPTO.md).

---

## Web (`/app/pass`)

Une fois le coffre **déverrouillé** :

- **Exporter sauvegarde** — télécharge un fichier JSON (backup local sur disque, clé USB, NAS, etc.).
- **Restaurer sauvegarde** — réimporte vers le cloud ; les entrées déjà présentes (même `ciphertext`) sont ignorées ; les coffres manquants sont recréés.

Fichiers : `passBackup.ts`, `PassBackupActions.tsx`.

---

## Mobile (`mobile/pass`)

### Cache local automatique

Après chaque chargement réussi des coffres + items via l’API, l’app écrit un snapshot `cloudity-pass-backup-v1` dans le répertoire documents de l’app (`PassLocalBackupStore`).

### Mode hors ligne

1. Si `GET /pass/vaults` échoue (pas de réseau, stack arrêtée), l’écran de déverrouillage bascule en **mode hors ligne** si une sauvegarde locale existe.
2. L’utilisateur saisit le **mot de passe maître** (comme d’habitude) — pas de dépendance réseau pour la dérivation Argon2id.
3. Les coffres et entrées sont lus depuis le cache ; bannière « Mode hors ligne ».

### Biométrie (empreinte / visage / code appareil)

- Après un déverrouillage réussi par mot de passe, proposition d’**activer la biométrie**.
- La master key est stockée dans le **secure enclave / Keystore** (`PassBiometricStore`), protégée par `local_auth`.
- Re-verrouillage auto (5 min inactivité ou app en arrière-plan) → bouton **Déverrouiller avec biométrie** sans retaper le maître.
- Désactivation : déconnexion compte (`PassSessionStore.clearAll`) ou désactivation future dans Paramètres (L2).

**Important** : la biométrie ne remplace pas le maître sur un **nouvel appareil** ; il faut toujours le mot de passe maître + sync cloud ou fichier exporté.

---

## Stratégie recommandée (utilisateur)

1. **Cloud** : utilisation normale Cloudity Pass (sync automatique tant que la stack est up).
2. **Export fichier** : mensuel ou avant migration — bouton web « Exporter sauvegarde » → stockage chiffré (le fichier reste illisible sans le maître).
3. **Mobile** : ouvrir Pass en ligne au moins une fois après des changements importants pour rafraîchir le cache local.
4. **Récupération** :
   - Cloud OK → reconnecter, déverrouiller.
   - Cloud KO, mobile avec cache → mode hors ligne + maître.
   - Tout perdu sauf fichier → « Restaurer sauvegarde » sur le web + maître.

---

## Différences vs KeePassXC

| Situation | KeePassXC (sync cloud) | Cloudity Pass |
|-----------|------------------------|---------------|
| Pas de réseau | Souvent bloqué si le fichier .kdbx distant est requis | Mobile : cache local + maître |
| Fichier distant corrompu | Ouverture impossible | Export indépendants ; cloud = blobs versionnés |
| Déverrouillage rapide | OS / keyfile | Biométrie après 1er unlock maître |
| Zero-access serveur | Fichier = secret si mal sync | Postgres ne voit que du ciphertext |

---

## Roadmap (L2)

- [ ] Export / import fichier depuis mobile (partage `cloudity-pass-backup-*.json`)
- [ ] File d’attente modifications offline → sync au retour réseau
- [ ] Import KeePass `.kdbx`
- [ ] Paramètres UI : désactiver biométrie, voir date dernière sauvegarde locale
- [ ] Backup chiffré additionnel avec mot de passe export (double enveloppe)

---

## Fichiers implémentation

| Zone | Fichiers |
|------|----------|
| Format | `frontend/packages/pass-crypto/src/backup.ts` |
| Web | `frontend/apps/cloudity-web/src/pages/app/pass/passBackup.ts`, `PassBackupActions.tsx` |
| Mobile cache | `mobile/pass/lib/features/pass_local_backup.dart` |
| Mobile biométrie | `mobile/pass/lib/features/pass_biometric_store.dart` |
| Mobile UI | `unlock_screen.dart`, `vaults_screen.dart`, `items_screen.dart` |


---

# 2. Digital Asset Links / passkeys

## Suite Cloudity — Digital Asset Links & passkeys Android

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
## Met à jour infrastructure/nginx/assetlinks.prod.json
##   et frontend/apps/cloudity-web/.well-known/assetlinks.json
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
## SHA-256 → base64url → android:apk-key-hash:PPbF...
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

Voir aussi : [MOBILE-PLATEFORME.md](MOBILE-PLATEFORME.md) § 4.1–4.2, [WEBAUTHN-PLAN.md](../securite/WEBAUTHN-PLAN.md).



---

# 3. Sprint archive 2026-05

## Sprint Pass — migration Proton Pass (échéance ~20 mai 2026)

**Rôle** : tracer le **chemin critique** pour remplacer Proton Pass avant fin d’abonnement payant (~25 mai 2026) ; cible de travail **20 mai 2026** (marge 5 jours).  
**Décision 2026-05-13** : **abandon provisoire** de la scission du monorepo en plusieurs dépôts GitHub — le dépôt unique reste la source de vérité tant que Pass + 2FA + extension ne sont pas utilisables au quotidien.

**Documents liés** : **[PASS-CRYPTO.md](../securite/PASS-CRYPTO.md)** (format `EnvelopeV1`, zero-access), **[ROADMAP.md](ROADMAP.md)** **APP-04**, **[BACKLOG.md](../../BACKLOG.md)** (section sprint ci-dessous), **[STATUS.md](../../STATUS.md)**.

---

## 1. État du dépôt au 2026-05-13 (résumé exécutable)

| Brique | État | Commentaire |
|--------|------|-------------|
| **`backend/passwords-service`** | **MVP API** | CRUD coffres + items (`ciphertext` opaque, `format_version`), RLS, admin `GET /pass/admin/format-versions`. Le serveur **ne déchiffre jamais** les blobs. |
| **`PASS-CRYPTO.md`** | **Spécification** | Argon2id, XChaCha20-Poly1305, HKDF, enveloppe v1 — **à implémenter côté client** (TS puis Dart). |
| **Web `PassPage.tsx`** | **Stub UX** | Liste coffres + items « Entrée #id / Chiffré » — **pas** de déverrouillage maître, pas d’éditeur, pas de générateur, pas d’import. |
| **Package `pass-crypto` (TS)** | **Absent** | À créer sous `frontend/packages/pass-crypto/` (workspace npm). |
| **Import Proton Pass** | **Absent** | Parser cible par défaut : **export JSON en clair** depuis l’app Proton Pass (le plus simple). Exports PGP / CSV en phase 2. |
| **TOTP *dans* les items** (secrets 2FA des sites tiers, type Proton) | **Absent** | Distinct du 2FA **compte Cloudity** ; nécessaire pour parité Proton Pass. |
| **2FA TOTP compte Cloudity** — backend | **Partiel** | `POST /auth/2fa/enable`, `POST /auth/2fa/verify` (`pquerna/otp`), colonnes `totp_secret`, `is_2fa_enabled`. **Pas** de codes de récupération en base aujourd’hui. |
| **2FA TOTP compte Cloudity** — web | **Incomplet** | `LoginPage` : si `requires_2fa` → toast *« non gérée pour l’instant »* ; pas d’écran code TOTP ; pas d’UI Settings dédiée (à câbler). |
| **WebAuthn / Passkeys** | **Avancé** | Login + admin passkeys — **ne remplace pas** le flux TOTP pour l’instant. |
| **Extension navigateur** (autofill) | **Absent** | Aucun dossier extension ; prévoir **Chrome MV3** en priorité, Firefox ensuite (`webextension-polyfill`). |
| **Mobile Flutter Pass** | **Absent** | `mobile/` contient drive / mail / photos — **pas** de `mobile/pass/`. |

---

## 2. Priorisation (défaut retenu si pas d’arbitrage produit)

### Niveau 1 — **bloquant** migration avant le 20 mai (**arbitrage acté 2026-05-13**)

1. `frontend/packages/pass-crypto` (TS) — implémentation **EnvelopeV1** (minimum : Argon2id + XChaCha20-Poly1305 + HKDF). **KEM hybride PQ ML-KEM-768** = phase ultérieure (v0.2) — la cible PQ reste documentée dans **PASS-CRYPTO.md** § 9 mais **n’est pas bloquante** pour la migration Proton (le format `EnvelopeV1` réserve déjà le champ `kem`, donc lazy-migration possible plus tard sans casser les coffres).
2. Refonte **`PassPage`** : déverrouillage maître, liste, **éditeur login** (URL, user, password, notes), **générateur**, copie presse-papiers avec auto-clear, recherche **locale** (pas d’index serveur).
3. **Import** fichier export Proton — **format retenu : JSON en clair** (Settings → Export → JSON sans chiffrement, plus simple et le plus complet pour les TOTP). PGP / CSV peuvent venir après.
4. **TOTP dans l’item** (schéma JSON `type: "totp"` + affichage code + période) pour les secrets des **sites tiers**.
5. **Finition 2FA compte Cloudity** : écran login étape 2 (code TOTP) + page Settings (QR / secret manuel / verify) ; **codes de récupération** (génération, hash serveur, usage unique) — nouveau chantier DB + API.
6. **Passkeys utilisateur (WebAuthn) compatibles password managers tiers** — *demandé 2026-05-13 nuit*. Aujourd'hui l'infra existe (`backend/auth-service/webauthn.go` + `frontend/apps/cloudity-web/src/webauthn.ts` + table `webauthn_credentials` migr. 37) mais **Phase W1 réservée admin** (`if role != 'admin'` → 403). Trois changements pour rendre la passkey **enregistrable par Proton Pass / Bitwarden / 1Password / iCloud Keychain** et permettre l'autofill au login :
    - Ouvrir l'enrôlement aux **comptes user** (avec quotas : max 5 passkeys / user, audit trail `webauthn_credentials.created_at` / `last_used_at` déjà en place ; doc `WEBAUTHN-PLAN.md` à mettre à jour).
    - Forcer **`residentKey: required` + `userVerification: preferred`** côté `BeginRegistration` (sinon les PM tiers n'enregistrent **pas** la passkey — c'est le critère W3C `discoverable credential`).
    - Ajouter **Conditional UI** sur `LoginPage` : input email avec `autocomplete="username webauthn"` + `navigator.credentials.get({ mediation: 'conditional', publicKey })` ; nouveau endpoint `POST /auth/webauthn/login/begin-discoverable` (challenge sans email préalable) ; `LoginFinish` résout l'utilisateur via `userHandle` retourné dans l'assertion.
    - Page **Settings → Sécurité → Passkeys** ouverte aux users (réutiliser le composant `Passkeys.tsx` existant côté admin, le brancher sur `/app/settings/security/passkeys`).
    - **Coût estimé** : ~1,5 à 2 j ; planifié **J5-J6 en parallèle du chantier 2FA** (mêmes migrations DB / mêmes écrans Settings, économie d'environ 0,5 j).
7. **`mobile/pass` Flutter — LECTURE SEULE** : port minimal `cloudity_shared/pass_crypto` (Dart) ; déverrouillage par mot de passe maître ; liste / détail / **copie presse-papiers avec auto-clear** ; déverrouillage par biométrie (`local_auth`) pour sessions courtes (≤ 5 min). **Pas d’édition au 20 mai** (faisable au clavier d’un téléphone, mais l’UX Flutter d’édition + génération + sync optimiste demande 2-3 j supplémentaires → reportée en L2).

### Niveau 2 — **après le 20 mai, en série**

7. **`mobile/pass` Flutter — édition** : création / modif / suppression d’items, générateur, sync optimiste, gestion conflits.
8. **Extension navigateur** MV3 (popup + content script autofill minimal : détection domaine → propose login/mot de passe).

### Niveau 3 — fond de roadmap (après stabilisation Pass)

9. Enrôlement multi-appareil **hybride PQ** X25519 + ML-KEM-768 (PASS-CRYPTO § 5) — bump `EnvelopeV1` → `v: 2`, lazy-migration des items existants.
10. **WebAuthn / Passkeys** comme **déverrouillage du coffre Pass lui-même** (en plus du mot de passe maître) — distinct du point 6 ci-dessus qui concerne la **connexion au compte Cloudity**. Alignement avec **WEBAUTHN-PLAN.md**.

---

## 3. Jalons jour par jour (indicatif 13 → 20 mai)

| Jour | Date | Livrable principal |
|------|------|---------------------|
| J1 | 13 mai | Acte doc (BACKLOG / STATUS / ce fichier) ; **bootstrap `frontend/packages/pass-crypto`** : skeleton workspace npm, types `EnvelopeV1`, dépendances (`argon2-browser`, `libsodium-wrappers`, `cbor-x`), tests smoke |
| J2 | 14 mai | **Crypto TS** : round-trip Argon2id → MK → VK → IK_item → ciphertext ; vecteurs reproductibles ; tests anti-tampering |
| J3 | 15 mai | **UI Pass web** : déverrouillage (mot de passe maître) + liste + éditeur login (URL/user/pwd/notes) + générateur + copie clipboard auto-clear |
| J4 | 16 mai | **Import Proton JSON** + **TOTP item** (RFC 6238 client) + **E2E Playwright** Pass (déverrouillage → import 5 entrées → vérification) |
| J5 | 17 mai | **Codes de récupération** (migration SQL + API `auth-service` + tests) + **2FA login web étape 2** (saisie code TOTP) + **Passkeys backend** : ouverture aux users non-admin (quota 5/user) + `residentKey: required` + endpoint `login/begin-discoverable` |
| J6 | 18 mai | **Settings 2FA web** (QR `otpauth://`, secret manuel, vérification, codes de récupération une fois) + **Settings Passkeys user** (réutilise `Passkeys.tsx` admin, branché sur `/app/settings/security/passkeys`) + **Conditional UI sur LoginPage** (`autocomplete="username webauthn"` + `mediation: 'conditional'`) → **Proton Pass / Bitwarden / iCloud Keychain enregistrent et proposent la passkey au login** |
| J7 | 19 mai | **Mobile Flutter `pass` LECTURE SEULE** : port Dart `cloudity_shared/pass_crypto` ; écrans déverrouillage / liste / détail ; biométrie `local_auth` ; copie presse-papiers auto-clear ; smoke E2E |
| **J8** | **20 mai** | **Migration réelle** depuis Proton Pass sur compte pilote (export JSON → import → vérification 50+ entrées + 2FA + lecture mobile) ; **bascule** : on lâche Proton Pass — **runbook** : § **3 bis** ci-dessous. |
| J+1..J+5 | 21 → 25 mai | Mobile Flutter Pass **édition complète** + extension Chromium MV3 (popup + autofill domain matching) |

### 3 bis Runbook J8 (migration Proton — exécutable manuellement)

Checklist opérationnelle (hors code) pour le jour J ; cocher au fil de l’eau :

- [ ] **Prévol automatisé** : `make pass-j8-prep` (lance `make test-pass` puis affiche cette checklist ; `SKIP_TESTS=1 make pass-j8-prep` si les tests ont déjà été validés).
- [ ] **Export** : Proton Pass → export **JSON en clair** (compte pilote) ; stockage chiffré disque / vault interne.
- [ ] **Prévol** : sauvegarde Cloudity (DB + volumes si applicable) ; noter rollback (**DEPLOIEMENT-VPS-PORTAINER-NPM.md** § 10 bis si VPS).
- [ ] **Import web** : `PassPage` → import fichier → **≥ 50** entrées visibles / cohérentes (titres, URLs, TOTP item si présents).
- [ ] **2FA compte Cloudity** : login web complet avec TOTP activé sur le même compte pilote.
- [ ] **Mobile `pass`** : lecture seule — déverrouillage, liste, détail sur un sous-ensemble représentatif.
- [ ] **Bascule** : désabonnement / abandon usage quotidien Proton Pass une fois les critères § 5 du sprint validés.

---

## 4. Hors périmètre immédiat (ne pas dévier)

- Scission multi-repo / submodules / OpenAPI split (reprendre après stabilisation Pass).
- mTLS `strict` sur tous les liens gateway (hors régression Pass).
- Drive / Mail / Photos **en priorité absolue concurrente** : seulement si une autre personne les prend ; sinon **gel** jusqu’après L1 Pass.

---

## 5. Critères d’acceptation « migration possible »

- [ ] Création / édition / suppression d’au moins **50 logins** importés depuis un export Proton JSON test (côté **web**).
- [ ] Mot de passe maître : **aucune** clé en clair côté serveur ; blobs conformes `format_version=1` ; tests anti-tampering verts (flip 1 bit dans `ct` ⇒ erreur AEAD).
- [ ] Connexion avec **2FA TOTP** activé sur le compte Cloudity (flow complet web : login → étape 2 → JWT).
- [ ] **Codes de récupération** : générés une fois (8 codes 10 chars), **hashés bcrypt** en base, utilisables après perte téléphone TOTP, marqués `used_at` après consommation.
- [ ] **Passkey enregistrable depuis Proton Pass / Bitwarden / iCloud Keychain** : enrôlement depuis Settings → Sécurité → Passkeys (compte user, pas admin only) ; le PM affiche un dialog *« Enregistrer la passkey pour Cloudity ? »* à l'enrôlement ; au login suivant, taper l'email **propose automatiquement** la passkey via le PM (Conditional UI).
- [ ] **Mobile Flutter Pass — lecture** : déverrouillage maître + liste + détail + copie clipboard avec auto-clear 30 s + biométrie `local_auth` pour reverrouillage rapide.
- [ ] Export de secours (JSON chiffré ou zip) — *nice-to-have* pour J+2.

## 6. Décisions actées 2026-05-13 (sans questionnaire)

| Sujet | Décision | Justification |
|-------|----------|---------------|
| **Mobile Pass** au 20 mai | **Lecture seule** (option A du calcul calendrier) | 7 j solo ne tiennent pas le scope complet — la lecture seule suffit pour migrer et consulter en mobilité. Édition mobile en J+1..J+5. |
| **Format import Proton** | **CSV (export complet)** ou **JSON en clair** | CSV = export par défaut Proton Pass ; JSON unencrypted pour les coffres multi-vault détaillés. |
| **PQ ML-KEM-768** dans `EnvelopeV1` | **Reportée v0.2** | Le format `EnvelopeV1` réserve le champ `kem` ; lazy-migration future possible sans casser les coffres. Argon2id + XChaCha20-Poly1305 suffisent pour la sécurité au repos avant 20 mai. |
| **Extension navigateur** | **Reportée J+1..J+5** | Pas bloquante : copie clipboard depuis web ou mobile suffit pour la migration ; autofill améliore le quotidien après. |
| **WebAuthn comme déverrouillage Pass** | **Phase ultérieure** | Le mot de passe maître reste la base ; WebAuthn complémentaire plus tard. |

*Dernière mise à jour : 2026-05-18.*

