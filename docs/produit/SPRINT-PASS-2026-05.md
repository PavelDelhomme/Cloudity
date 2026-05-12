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

### Niveau 1 — **bloquant** migration avant le 20 mai

1. `frontend/packages/pass-crypto` — implémentation **EnvelopeV1** (minimum : Argon2id + XChaCha20-Poly1305 + HKDF ; KEM hybride PQ peut suivre en **v0.2** si le délai impose un premier jet sans ML-KEM côté web — à trancher avec **PASS-CRYPTO.md** § 9 *v0.1 PoC*).
2. Refonte **`PassPage`** : déverrouillage maître, liste, **éditeur login** (URL, user, password, notes), **générateur**, copie presse-papiers avec auto-clear, recherche **locale** (pas d’index serveur).
3. **Import** fichier export Proton (JSON clair) → création d’items chiffrés côté client puis `POST /pass/vaults/:id/items`.
4. **TOTP dans l’item** (schéma JSON `type: "totp"` + affichage code + période) pour les secrets des **sites tiers**.
5. **Finition 2FA compte Cloudity** : écran login étape 2 (code TOTP) + page Settings (QR / secret manuel / verify) ; **codes de récupération** (génération, hash serveur, usage unique) — nouveau chantier DB + API.

### Niveau 2 — **souhaitable** si le L1 tient le 19 mai

6. **Extension navigateur** MV3 (popup + content script autofill minimal : détection domaine → propose login/mot de passe).

### Niveau 3 — **après** le 20 mai ou en parallèle si ressource double

7. **`mobile/pass`** Flutter (lecture puis édition ; biométrie pour session courte).
8. Enrôlement multi-appareil **hybride PQ** (PASS-CRYPTO § 5) — aligné roadmap crypto long terme.

---

## 3. Jalons jour par jour (indicatif 13 → 20 mai)

| Jour | Date | Livrable principal |
|------|------|---------------------|
| J1 | 13 mai | Acte doc (BACKLOG / STATUS / ce fichier) ; bootstrap `frontend/packages/pass-crypto` + types + tests smoke |
| J2 | 14 mai | Crypto : round-trip chiffrement/déchiffrement + vecteurs ; doc mise à jour si écart avec PASS-CRYPTO |
| J3 | 15 mai | UI Pass : déverrouillage + liste + éditeur login + générateur |
| J4 | 16 mai | Import Proton JSON + TOTP item + E2E Playwright Pass |
| J5 | 17 mai | Codes de récupération + migration SQL + API auth |
| J6 | 18 mai | Login 2FA + Settings 2FA (web) branchés sur API existante |
| J7 | 19 mai | Extension MV3 minimaliste OU polish Pass + tests charge légers |
| **J8** | **20 mai** | **Migration réelle** depuis Proton Pass sur un compte pilote + checklist post-migration |

---

## 4. Hors périmètre immédiat (ne pas dévier)

- Scission multi-repo / submodules / OpenAPI split (reprendre après stabilisation Pass).
- mTLS `strict` sur tous les liens gateway (hors régression Pass).
- Drive / Mail / Photos **en priorité absolue concurrente** : seulement si une autre personne les prend ; sinon **gel** jusqu’après L1 Pass.

---

## 5. Critères d’acceptation « migration possible »

- [ ] Création / édition / suppression d’au moins **50 logins** importés depuis un export Proton JSON test.
- [ ] Mot de passe maître : **aucune** clé en clair côté serveur ; blobs conformes `format_version` attendu.
- [ ] Connexion avec **2FA TOTP** activé sur le compte Cloudity (flow complet web).
- [ ] Codes de récupération : générés une fois, **hashés** en base, utilisables après perte téléphone TOTP.
- [ ] Export de secours (JSON chiffré ou zip) — *nice-to-have* pour J+2.

*Dernière mise à jour : 2026-05-13.*
