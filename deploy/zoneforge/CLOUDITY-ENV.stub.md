# ZoneForge — projet Cloudity (stub ZF-01)

À importer / recopier dans **[ZoneForge](https://github.com/PavelDelhomme/ZoneForge)** quand tu crées l’environnement Cloudity.

**Ne contient aucun secret.** Les tokens OVH / NPM / Portainer restent dans le `.env` ZoneForge.

---

## Identité

| Champ | Valeur conseillée |
|-------|-------------------|
| Nom env | `cloudity` (prod) · `cloudity-preprod` (préprod) |
| Repo Git | `https://github.com/PavelDelhomme/Cloudity.git` |
| Branche deploy | `dev` (préprod) · `main` (prod) quand prêt |
| Compose | `deploy/portainer/docker-compose.stack.yml` (ajuster si split stacks) |

---

## Providers à brancher (ZoneForge)

| Kind | Rôle pour Cloudity |
|------|--------------------|
| `ovh` | DNS `A` `cloudity.<dom>` + `api.cloudity.<dom>` |
| `npm` | Proxy hosts web `:3000` + api-gateway `:8000`, Force SSL |
| `portainer` | Stack create / update / redeploy |
| `docker` | Optionnel (inspection conteneurs) |

Après branchement : `POST /api/environments/:id/sync` (API ZoneForge).

---

## Env injecté (depuis Cloudity PC)

Sur le dépôt Cloudity :

```bash
make sync-public-urls
make env-prod DOMAIN=<ton-domaine>    # ou env-preprod
make portainer-env                    # coller / mapper dans ZoneForge publish
```

Variables critiques : `CORS_ORIGINS`, `CORS_ALLOW_LAN=false`, `VITE_API_URL`, `CLOUDITY_MOBILE_GATEWAY_URL`, secrets DB/JWT (Portainer/ZF only).

---

## Critères ZF-01 (Pilotage)

- [ ] Env `cloudity` / `cloudity-preprod` créés dans ZoneForge
- [ ] Providers `ovh` + `npm` + `portainer` OK (sync sans erreur)
- [ ] Ce stub lu ; secrets **pas** dans Cloudity git

Suite : **ZF-02** (template publish) → **ZF-03** (premier redeploy préprod).

Doc : [ZONEFORGE-CLOUDITY.md](../../docs/operations/ZONEFORGE-CLOUDITY.md)
