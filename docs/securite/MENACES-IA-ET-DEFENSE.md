# Menaces IA augmentées & défense moderne — feuille de route Cloudity

**Rôle** : cadrer les risques **offensifs assistés par IA** et la **réponse défensive** (dont post-quantique), **sans implémentation immédiate**.  
**Statut** : **planification** — à traiter **après** Mail/Pass MVP, mTLS, et barrière `make test` stable.

**Documents liés** :

| Sujet | Fichier |
|-------|---------|
| Vision sécurité produit | **[SECURITE.md](SECURITE.md)** |
| Anti-abus HTTP + SMTP | **[../architecture/ANTI-SPAM-ET-ABUS.md](../architecture/ANTI-SPAM-ET-ABUS.md)** |
| TLS edge + hybride PQ | **[REVERSE-PROXY.md](REVERSE-PROXY.md)** |
| mTLS microservices | **[MTLS-INTERNE.md](MTLS-INTERNE.md)** |
| Pass E2EE + hybride X25519/ML-KEM | **[PASS-CRYPTO.md](PASS-CRYPTO.md)** |
| Suivi exécutable | **[../../BACKLOG.md](../../BACKLOG.md)** · **[../../TODOS.md](../../TODOS.md)** § Sécurité (plus tard) |

---

## 1. Principe

Supposer que l’attaquant dispose d’**agents IA** (recon, fuzzing, phishing, exfil adaptative). La défense ne se limite pas aux signatures statiques : il faut **comportement**, **corrélation**, **crypto-agilité** et **tests continus**.

---

## 2. Offensive assistée par IA (à couvrir)

### 2.1 Reconnaissance automatique

- Scans de masse, corrélation OSINT, listes de cibles avec **scoring exploitabilité**.
- **Cloudity** : limiter l’énumération (messages génériques login, 404 uniformes) — déjà partiellement dans **SECURITE.md** § 6.1 ; compléter par WAF + rate limit IP.

### 2.2 Exploitation adaptative

- Bots qui varient payloads selon réponses HTTP/erreurs.
- **Cloudity** : gateway rate-limit, validation stricte, pas de stack traces en prod ; fuzzing CI (DAST) sur staging.

### 2.3 Mouvement latéral intelligent

- Exploration API / réseau pour comptes à privilèges.
- **Cloudity** : **mTLS** inter-services (**MTLS-INTERNE.md**), pas de confiance header client, admin double contrôle mail.

### 2.4 Exfiltration furtive

- Ajustement rythme/volume pour éviter SIEM.
- **Cloudity** : quotas export, alertes volume anormal, audit admin.

### 2.5 Contexte API / SaaS (prioritaire pour Cloudity)

| Menace | Piste défense |
|--------|----------------|
| **Bruteforce / password guessing augmenté** | Rate limit login/register, MFA/2FA, recovery codes, captcha edge (prod) |
| **Abus logique métier** (signup, coupons, exports) | Tests métier, idempotence, plafonds, revue workflows |
| **Évasion détection** (UA, rythme humain) | UEBA sur séquences d’endpoints, géo, device fingerprint léger |
| **Prompt injection / exfil** (si endpoints IA) | Sandboxing, pas de secrets en contexte, allowlist outils |

---

## 3. Défense « augmentée » (cible)

| Capacité | Description | Backlog indicatif |
|----------|-------------|-------------------|
| **UEBA / anomalies API** | Séquences anormales par user/IP/device | AS-* + télémétrie gateway |
| **Corrélation logs** | Auth + API + infra multi-étapes | Audit admin, pipeline ingest perf |
| **Réponse automatisée** | Bloc IP, durcissement WAF temporaire, rotation tokens | WAF prod + runbook incident |
| **DAST / fuzzing IA** | Scan staging avant merge | PERF-CLI-05, job CI dédié |

---

## 4. Post-quantique (PQC)

### 4.1 Risques

- **Shor** : menace théorique sur RSA/ECC classiques (TLS, signatures).
- **Collect now, decrypt later** : interception TLS aujourd’hui, déchiffrement futur.
- Données **longue durée** (mail archivé, secrets Pass, santé) les plus exposées.
- Normalisation : migration progressive vers **ML-KEM / ML-DSA** (NIST).

### 4.2 Déjà dans Cloudity

- **Pass** : enveloppe hybride X25519 + ML-KEM-768 — **PASS-CRYPTO.md**.
- **Edge** : gabarits TLS hybrides — **REVERSE-PROXY.md**.

### 4.3 À faire (plus tard)

- [ ] **SEC-PQC-01** — Inventaire crypto (TLS, JWT, SMTP, backups, PG).
- [ ] **SEC-PQC-02** — Politique **crypto-agilité** (rotation algos sans refonte).
- [ ] **SEC-PQC-03** — TLS hybride prod (NPM / Caddy) + tests clients.
- [ ] **SEC-PQC-04** — Évaluer PFS + durée de rétention mail/serveur (CNIL / sensibilité).

---

## 5. Ordre recommandé (ne pas tout faire maintenant)

1. **Court terme** (en cours) : secrets, 2FA, rate limit gateway, anti-spam **AS-0** doc, mTLS permissif.
2. **Moyen terme** : Rspamd/MTA (**AS-1**), WAF edge, audit actions admin, UEBA léger sur `/auth` + exports.
3. **Long terme** : DAST IA en CI, réponse automatisée, PQC full-stack, détection ransomware snapshots.

---

## 6. Cases à cocher (suivi)

| ID | Tâche | Priorité | État |
|----|--------|----------|------|
| SEC-IA-01 | Documenter runbook incident (compte compromis, fuite JWT) | P1 | ☐ |
| SEC-IA-02 | WAF + rate limit **par IP** sur login (prod) | P1 | ☐ |
| SEC-IA-03 | Alertes volume export / bulk mail | P2 | ☐ |
| SEC-IA-04 | Job CI fuzz/DAST sur `staging` | P2 | ☐ |
| SEC-PQC-01 | Inventaire usages crypto | P2 | ☐ |
| SEC-PQC-03 | TLS hybride prod | P3 | ☐ |

Mettre à jour **BACKLOG.md** quand une ligne passe en chantier actif.
