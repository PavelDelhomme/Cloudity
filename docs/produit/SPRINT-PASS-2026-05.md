# Sprint Pass — migration Proton Pass (échéance ~20 mai 2026)

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
