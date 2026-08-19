# Portainer — formulaire Git (copier-coller)

Stack **`cloudity`** · branche **`prod`** (ou `feat/notes-google-keep` en attendant).

---

## Stacks → Add stack (ou Edit stack)

| Champ | Valeur |
|-------|--------|
| **Name** | `cloudity` |
| **Build method** | **Repository** |
| **Repository URL** | `https://github.com/PavelDelhomme/Cloudity` |
| **Repository reference** | `refs/heads/prod` |
| **Compose path** | `deploy/portainer/docker-compose.ghcr.yml` |
| **Additional paths** | *(laisser vide)* |
| **Repository authentication** | ON si repo privé → GitHub user + PAT (`repo`) |
| **Environment variables** | **Load variables from file** → voir ci-dessous |
| **GitOps updates** | ON (recommandé) |
| **Re-pull image and redeploy** | ON |
| **Prune unused containers** | OFF |

---

## Fichier Environment (sur ton PC)

```bash
cd ~/Documents/Dev/Perso/Cloudity/Cloudity
make portainer-prod-env NPM_NETWORK=nginx-proxy-manager_npm-network
```

Fichier généré (gitignored, **ne jamais committer**) :

```
deploy/portainer/stack.env
```

Dans Portainer :

1. **Environment variables** → **Advanced mode**
2. **Load variables from .env file** (ou équivalent) → sélectionner `stack.env`
3. Ou ouvrir le fichier et coller tout le contenu

Sur le VPS (alternative) :

```bash
scp deploy/portainer/stack.env user@95.111.227.204:/opt/cloudity/stack.env
```

---

## Après Deploy

1. Attendre que **GHCR** ait fini de builder (`make publish-ghcr REF=prod WAIT=1`)
2. Portainer → stack → **Pull and redeploy** si images pas encore pullées
3. Vérifier logs : `cloudity-db-migrate` → exited 0, `cloudity-api-gateway` → healthy

---

## Référence branche

| Phase | Repository reference |
|-------|---------------------|
| Maintenant (images feat) | `refs/heads/feat/notes-google-keep` |
| Prod stable | `refs/heads/prod` |

Créer `prod` depuis le PC :

```bash
git checkout -b prod && git push -u origin prod
```
