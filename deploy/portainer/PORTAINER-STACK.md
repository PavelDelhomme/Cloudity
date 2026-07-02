# Stack Portainer « cloudity-stack » — déploiement Git

Guide pas à pas pour créer la stack **`cloudity-stack`** dans Portainer avec **dépôt Git**.

**Dépôt** : `https://github.com/PavelDelhomme/Cloudity.git`

---

## 1. Workflow Git (dev → prod)

| Branche | Rôle | Portainer |
|---------|------|-----------|
| `feat/nom-du-chantier` | Travail quotidien | — (local `make up` / `make test`) |
| `dev` | Intégration, CI verte | Optionnel : **`cloudity-stack-dev`** → `refs/heads/dev` |
| `main` | **Production stable** | **`cloudity-stack`** → `refs/heads/main` |

```text
feat/*  →  PR vers dev  →  tests OK  →  merge dev → main  →  Portainer redéploie
```

- **Jamais** de `.env` avec secrets sur GitHub.
- Secrets = **Portainer → Environment variables** uniquement.

Docs : [BRANCHES.md](../../docs/operations/BRANCHES.md) · [DEPLOIEMENT-SUIVI.md](../../docs/operations/DEPLOIEMENT-SUIVI.md).

---

## 2. Formulaire Portainer — `cloudity-stack` (prod)

**Stacks → Add stack** :

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity-stack` |
| **Build method** | **Git repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity.git` |
| **Repository reference** | `refs/heads/main` |
| **Compose path** | `deploy/portainer/docker-compose.stack.yml` |
| **Additional paths** | *(vide)* |
| **Authentication** | Repo **privé** : user GitHub + PAT (`repo`) |
| **Skip TLS Verification** | Non |

### GitOps updates

| Option | Valeur |
|--------|--------|
| GitOps | **Activé** |
| Polling | ex. **5 minutes** |
| Reference | `refs/heads/main` |

### Stack dev (optionnel)

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity-stack-dev` |
| **Repository reference** | `refs/heads/dev` |
| **Compose path** | `deploy/portainer/docker-compose.stack-dev.yml` |

---

## 3. Variables d'environnement

**Advanced mode** dans Portainer. Modèle : [stack.env.example](./stack.env.example).

Sur ton PC :

```bash
make secrets-print
```

Puis adapte les URLs HTTPS (`VITE_API_URL`, `CORS_ORIGINS`, `WEBAUTHN_*`, `CLOUDITY_MOBILE_GATEWAY_URL`).

---

## 4. NPM (HTTPS)

| FQDN | Container | Port |
|------|-----------|------|
| `api.cloudity.<domaine>` | `cloudity-api-gateway` | 8000 |
| `cloudity.<domaine>` | `cloudity-web` | 3000 |
| `admin.cloudity.<domaine>` | `cloudity-web` | 3000 |

Voir [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../../docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md).

---

## 5. Première mise en service

1. Créer stack + variables § 3.
2. **Deploy** (premier build long).
3. Vérifier `cloudity-db-migrate` terminé.
4. Créer compte admin (seed).
5. `make smoke-prod` avec URLs NPM.

---

## 6. Fichiers

| Fichier | Branche |
|---------|---------|
| `docker-compose.stack.yml` | `main` (prod) |
| `docker-compose.stack-dev.yml` | `dev` |
| `stack.env.example` | modèle variables |
