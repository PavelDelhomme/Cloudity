# WebAuthn / passkeys — plan d’implémentation (Cloudity)

**Décision** : Q17=A — activer **WebAuthn (FIDO2 / passkeys)** pour **`/4dm1n` web en priorité**, puis étendre aux utilisateurs après validation.

**Références** : [SECURITE.md](SECURITE.md) § 2–3, [CRYPTO-NORME.md](CRYPTO-NORME.md) § 1.3 (asymétrique), [SECURITE-DONNEES.md](SECURITE-DONNEES.md).

---

## 1. Objectifs

| Objectif | Détail |
|----------|--------|
| **Sécurité** | Remplacer ou compléter le TOTP par une preuve de possession **phishing-resistant** (clé matérielle ou passkey plateforme). |
| **UX admin** | Connexion `/4dm1n` sans code à 6 chiffres si passkey enregistrée ; TOTP reste en **fallback** pendant la transition. |
| **Interop** | Navigateurs modernes (Chrome, Firefox, Edge, Safari) + futur **mobile admin** (Credential Manager API / passkeys). |

---

## 2. Périmètre par phase

### Phase W1 — Backend (auth-service)

1. **Schéma PostgreSQL** (nouvelle migration) :
   - `webauthn_credentials` : `id`, `user_id`, `credential_id` (bytea unique), `public_key` (COSE / raw), `sign_count` (uint32), `aaguid`, `transports` (jsonb), `attestation` (enum `none|direct|indirect`), `nickname`, `created_at`, `last_used_at`.
   - Option : table `webauthn_challenges` avec TTL court (Redis préférable pour les challenges : clé `webauthn:challenge:<random>`, TTL 5 min).

2. **Librairie Go** : [`github.com/go-webauthn/webauthn`](https://github.com/go-webauthn/webauthn) (maintenue, alignée W3C WebAuthn L3).

3. **Endpoints** (sous `/auth/webauthn/...`, protégés par session ou JWT court « enrollment ») :
   - `POST /auth/webauthn/register/begin` — renvoie `PublicKeyCredentialCreationOptions`.
   - `POST /auth/webauthn/register/finish` — vérifie attestation, stocke credential.
   - `POST /auth/webauthn/login/begin` — renvoie `PublicKeyCredentialRequestOptions`.
   - `POST /auth/webauthn/login/finish` — vérifie assertion, émet **access + refresh** (même flux que login mot de passe).

4. **Politique** :
   - **RP ID** : en prod `cloudity.example.com` (sans sous-domaine si passkeys partagées app + api) — à trancher : souvent `app.` uniquement pour le web ; documenter le choix final.
   - **Origins** : liste stricte (`https://app.cloudity.example.com`, `https://admin.cloudity.example.com`).
   - **Attestation** : `none` par défaut (moins de friction) ; `direct` optionnel pour admins exigeant YubiKey vérifiée.

5. **Rôles** : W1 limite l’enregistrement WebAuthn aux comptes `role = admin` (ou flag `can_webauthn`).

### Phase W2 — Frontend `/4dm1n` (cloudity-web)

1. **Flux** : après login mot de passe + éventuel 2FA TOTP, proposer « Ajouter une passkey » (bouton `navigator.credentials.create`).
2. **Login** : page dédiée « Connexion admin » avec bouton « Se connecter avec une passkey » (`navigator.credentials.get`) en plus du formulaire classique.
3. **Gestion** : liste des credentials (nom, date d’ajout, dernière utilisation), révocation.

### Phase W3 — Mobile admin

1. **Flutter** : package type `passkeys` / intégration Credential Manager (Android) + ASAuthorization (iOS) — à évaluer au moment du sprint.

### Phase W4 — Utilisateurs généraux (hors `/4dm1n`)

1. Après stabilisation W1–W3, ouvrir l’enregistrement aux rôles `user` avec les mêmes endpoints (quotas par utilisateur, ex. max 5 passkeys).

---

## 3. Sécurité — points de contrôle

- [ ] **Challenge** : aléa CSPRNG 32+ octets, usage unique, TTL ≤ 5 min (Redis).
- [ ] **Replay** : `sign_count` strictement croissant par credential (spec WebAuthn).
- [ ] **RP ID / origin** : validation stricte côté serveur (pas de confiance au client).
- [ ] **Credential ID** : index unique global (pas seulement par user).
- [ ] **Pas de log** des challenges, assertions brutes ou clés privées côté client.
- [ ] **Rate limit** sur `/auth/webauthn/*` (même logique que login).
- [ ] **Recovery** : codes de secours ou procédure support documentée avant activation obligatoire.

---

## 4. Hors périmètre (pour l’instant)

- Passkeys **sans** second facteur pour comptes à risque élevé — TOTP ou 2e WebAuthn recommandé pour `/4dm1n` critique.
- **Attestation enterprise** (PIV, smartcard) — phase ultérieure si besoin compliance.

---

## 5. Suivi

- Tâches détaillées : **[BACKLOG.md](../../BACKLOG.md)** § Crypto / perf (WebAuthn).
- Après livraison W1 : mettre à jour **STATUS.md** § 2.3 et **SECURITE-DONNEES.md**.

---

## 6. Statut Phase W1 — backend (livré 2026-05-12)

| Composant | Statut | Détail |
|-----------|--------|--------|
| Migration `webauthn_credentials` | ✅ | `infrastructure/postgresql/migrations/37-webauthn-credentials.sql` (FK `users(id)`, unique global sur `credential_id`, index user_id, sign_count CHECK). |
| Lib Go | ✅ | `github.com/go-webauthn/webauthn v0.17.3` ajoutée à `auth-service/go.mod`. |
| Endpoints | ✅ | `POST /auth/webauthn/register/{begin,finish}` (Bearer admin requis), `POST /auth/webauthn/login/{begin,finish}` (publics), `GET /auth/webauthn/credentials`, `DELETE /auth/webauthn/credentials/:id`. |
| Stockage challenges | ✅ | Redis, clé `webauthn:session:{register|login}:<uid>`, TTL 5 min, **usage unique** (DEL après lecture). |
| Replay protection | ✅ | `bumpSignCount` UPDATE conditionnel (`sign_count < $1`) — refuse les rejeux. |
| Tests Go | ✅ | `webauthn_test.go` : config defaults, JWT admin gate (EdDSA accepté, role `user` rejeté, bearer manquant rejeté), boot service avec config invalide. |
| Gateway | ✅ | Routes `/auth/webauthn/login/*` ajoutées à la liste `public` dans `authMiddleware`. `/auth/webauthn/register/*` reste protégé (admin Bearer requis). |
| Variables | ✅ | `WEBAUTHN_RP_ID` (def `localhost`), `WEBAUTHN_RP_NAME` (def `Cloudity Admin`), `WEBAUTHN_ORIGINS` (def `http://localhost:6001,http://localhost:5173`). |

## 7. Statut Phase W2 — frontend (livré 2026-05-12)

| Composant | Statut | Détail |
|-----------|--------|--------|
| Module helpers | ✅ | `frontend/apps/cloudity-web/src/webauthn.ts` : encodage base64url ↔ ArrayBuffer, `reviveCreationOpts/reviveRequestOpts`, `attestationToJSON`, `assertionToJSON`. |
| Page `/4dm1n/passkeys` | ✅ | `frontend/apps/cloudity-web/src/pages/admin/Passkeys.tsx` — liste + ajout + suppression (avec confirmation). React Query + toast. Désactive si `isWebAuthnSupported() === false`. |
| Bouton login passkey | ✅ | `pages/public/LoginPage.tsx` : sous le bouton standard, "Se connecter avec une passkey" déclenche `loginWithPasskey(email, '1')` (tenant_id=1 par défaut). |
| Endpoint révocation | ✅ | `DELETE /auth/webauthn/credentials/:id` côté backend + bouton corbeille côté UI. Suppression scoppée au `user_id` du Bearer. |
| Tests | ✅ | Vitest 246 passed. ESLint clean. Vite build OK. Tests Go 1.9 s. |

### 7.1 Reste à faire (Phase W3+)

- Tests Playwright avec [virtual authenticator Chromium](https://chromedevtools.github.io/devtools-protocol/tot/WebAuthn/) (CDP `WebAuthn.addVirtualAuthenticator`) — couvre register + login bout-en-bout sans clé physique.
- Mobile : intégration Credential Manager (Android) / `ASAuthorization` (iOS) — au moment du sprint mobile admin.
- Quotas par utilisateur (max 5 passkeys) avant ouverture aux comptes hors admin.

---

*Document vivant — dernière mise à jour : 2026-05-12 (Q17=A).*
