# Politique secrets — Cloudity

> **Règle d'or** : aucun secret réel (mot de passe, clé privée, jeton, IV / clé symétrique de production) **ne doit être commité** dans Git, dans aucune branche, à aucun moment.
>
> En cas de doute → traite la valeur **comme un secret**. **Audit transverse** : voir **[AUDIT-SECURITE.md](AUDIT-SECURITE.md)**, **[CRYPTO-NORME.md](CRYPTO-NORME.md)**.

---

## 1. Inventaire des secrets Cloudity

| Secret | Périmètre | Origine | Stockage prod |
|--------|-----------|---------|----------------|
| `POSTGRES_PASSWORD` | DB principale | `make secrets` (256 bits) | Variable Portainer / secret manager |
| `REDIS_PASSWORD` | cache + refresh tokens | `make secrets` | Variable Portainer / secret manager |
| `JWT_SECRET` | secret HMAC legacy (RS256 désactivable, EdDSA prioritaire) | `make secrets` | Variable Portainer |
| Paire RSA (`private.pem` + `public.pem`) | JWT RS256 (legacy) | générée par `auth-service` au boot | Volume Docker `cloudity_auth_keys` |
| Paire Ed25519 (`private_ed25519.pem` + `public_ed25519.pem`) | JWT EdDSA (cible) | générée par `auth-service` au boot | Volume Docker `cloudity_auth_keys` |
| `PERFORMANCE_INGEST_TOKEN` | header `X-Cloudity-Perf-Ingest` (gateway + admin-service) | `make secrets` | Variable Portainer (**même valeur** sur les deux services) |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | AES-256-GCM des passwords IMAP/SMTP | `openssl rand -hex 32` (32 octets) | Variable Portainer |
| `ALIAS_ENCRYPTION_KEY` | clé symétrique alias / champs sensibles (futur ; parité VPS) | `openssl rand -base64 32` ou **`make ensure-alias-encryption-key`** | Variable Portainer |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth Gmail | console Google Cloud | Variable Portainer (jamais .env public) |
| Mot de passe CA `step-ca` | PKI mTLS interne | `step ca init` ou `openssl rand -hex 32` | Volume **chiffré** Portainer (`infrastructure/step-ca/secrets/ca-password`) |
| Clé Restic / Borg | backups offsite | `openssl rand -base64 48` | Coffre hors VPS (RPi + clef physique séparée) |

---

## 2. Génération recommandée

```bash
# Cloudity, racine du repo :
make secrets             # crée .env (chmod 600) avec POSTGRES, REDIS, JWT, PERFORMANCE_INGEST_TOKEN, MAIL_*, ALIAS_*
make secrets-print       # affiche un set de secrets sans rien écrire
./scripts/dev/gen-secrets.sh --force                   # écrase .env existant
OUTPUT=.env.production.example ./scripts/dev/gen-secrets.sh   # template prod
openssl rand -hex 32     # secret 256 bits (utilisable comme clé AES-256)
openssl rand -base64 48  # token URL-safe
```

> **Toujours** utiliser un CSPRNG (`/dev/urandom`, `openssl rand`, `crypto/rand` Go). Jamais `Math.random`, `time.Now()`, ni des UUID v1.

---

## 3. Stockage en clair (interdit)

- ❌ `git add .env` (le `.gitignore` racine couvre `.env`, `.env.dev`, `.env.production`, `.env.*.local`, etc.).
- ❌ Coller un secret réel dans un fichier `.md`, un commentaire de code, un PR description.
- ❌ Logger un secret (token, password, clé) — `log.Printf("token=%s", ...)` est interdit.
- ❌ Capturer un secret dans une issue / Slack / email sans flag `cleartext`.
- ❌ Versionner un dump SQL (`.sql.gz`, `.dump`) qui peut contenir des hashes ou des tokens utilisateurs.

Secrets **autorisés** dans le repo :
- Exemples documentés (`.env.example`, `infrastructure/step-ca/secrets/ca-password.example`) — valeurs **clairement** « dev only » (ex. `change_me_super_secret`, `dev_only_change_me_via_make_secrets`).
- Clés **publiques** liées à des comptes externes (ex. SSH host key publique). Aucune clé privée.

---

## 4. Conventions de placeholder

Un placeholder Cloudity DOIT contenir l'un de ces marqueurs (pour distinguer du « vrai secret oublié ») :

```
change_me_*
dev_only_*_change_me*
0000…0000   (clé hex tout-zéros, taille correcte)
PLACEHOLDER_*
```

Exemples actuels dans le repo :
- `MAIL_PASSWORD_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000` (ancien placeholder Compose — **à éviter** : `make ensure-mail-encryption-key` ou `gen-secrets.sh` ; le service **refuse** de chiffrer/déchiffrer avec cette clé : voir `validateMailEncryptionKeyAtBoot` + tests `TestEncryptPasswordRejectsZeroKey`).
- `PERFORMANCE_INGEST_TOKEN=dev_perf_ingest_change_me` dans `docker-compose.yml`.
- Mots de passe Postgres / Redis / JWT par défaut suffixés `_2025` ou préfixés `dev_only_*` selon le fichier — **non utilisables tels quels en prod** (gateway et admin-service refusent de démarrer si certaines variables sont vides — cf. `routes/stats.py` `require_perf_ingest_token` qui retourne 503).

---

## 5. Procédure « j'ai poussé un secret »

1. **Ne pas paniquer** mais agir vite :
   - Révoquer le secret côté émetteur (rotate JWT_SECRET, regénérer la paire RSA, révoquer le client OAuth Google, etc.).
   - Si DB / Redis : changer le mot de passe et rotater immédiatement.
2. Réécrire l'historique Git :
   ```bash
   # Outil recommandé : git-filter-repo (à installer hors repo)
   git filter-repo --path <fichier> --invert-paths
   git push --force --all
   git push --force --tags
   ```
   Force-push **uniquement** sur les branches concernées ; prévenir l'équipe avant.
3. Auditer GitHub :
   - vérifier qu'aucun fork public ne reste avec le secret ;
   - GitHub conserve les commits orphelins ~90 j → contacter le support si secret critique exfiltré.
4. Renouveler **toutes les valeurs** dérivées (cookies signés avec l'ancien JWT_SECRET deviennent invalides — communiquer une déconnexion forcée aux utilisateurs).
5. Documenter l'incident dans **[AUDIT-SECURITE.md](AUDIT-SECURITE.md)** et **[STATUS.md](../../STATUS.md)** (section incidents).

---

## 6. Détection automatisée

| Étape | Outil | Commande |
|-------|-------|----------|
| Pre-commit | `gitleaks protect --staged` | **`make secrets-scan-staged`** |
| CI / pré-merge | `gitleaks detect` sur historique | **`make test-security`** (intégré, mode WARNING ; `GITLEAKS_BLOCKING=1` pour fail) |
| Audit ponctuel | `gitleaks detect --redact -v` | **`make secrets-scan`** |
| Manuel | `git ls-files \| xargs rg -i 'BEGIN PRIVATE KEY\|ghp_\|AKIA\|dckr_pat_'` | Vérification rapide |

> **Statut 2026-05-12** : 157 commits scannés sans fuite ; gitleaks intégré à `make test-security` (mode WARNING). Bascule en `GITLEAKS_BLOCKING=1` dès le prochain sprint vert.

---

## 7. Politique de rotation

| Secret | Rotation | Déclencheur |
|--------|----------|-------------|
| `JWT_SECRET` | tous les 6 mois (rolling) | sortie d'admin / fuite suspectée |
| Paire RSA / Ed25519 auth-service | tous les 12 mois (recouvrement par `kid`) | en même temps que la phase JWT EdDSA → ML-DSA |
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | annuelle minimum | rotation infra Portainer |
| `MAIL_PASSWORD_ENCRYPTION_KEY` | jamais (sinon re-chiffrer le contenu existant) | uniquement si compromission ; voir migration ciphertext **CRYPTO-NORME.md** |
| `PERFORMANCE_INGEST_TOKEN` | semestrielle | sortie d'un dev avec accès CI |
| OAuth Google | rotation Google Cloud → mettre à jour la stack | révocation côté Google |

---

## 8. Liens

- **[AUDIT-SECURITE.md](AUDIT-SECURITE.md)** — audit transverse (admin UI, gateway, admin-service, mail admin-only).
- **[CRYPTO-NORME.md](CRYPTO-NORME.md)** — algos / paramètres autorisés.
- **[MTLS-INTERNE.md](MTLS-INTERNE.md)** — secrets PKI / step-ca interne.
- **[../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md](../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)** — secrets prod via Portainer.
