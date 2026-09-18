# Ops suite — backup, rollback submodule, .env, CI, réseau, JWT

Complète le brief Cursor et l’email décisions. **Priorités** : backup volumes → DX secrets → réseau Docker → SSO JWT.

---

## 1. Backup volumes VPS (`backup-suite-volumes.sh`)

Script : [`scripts/ops/backup-suite-volumes.sh`](../../scripts/ops/backup-suite-volumes.sh)

```bash
# Sur le VPS
cd /path/to/Cloudity   # ou copie du script seule
chmod +x scripts/ops/backup-suite-volumes.sh
./scripts/ops/backup-suite-volumes.sh           # dry-run
# Défaut writable : ~/backups/cloudity-suite (évite Permission denied sur /var/backups)
./scripts/ops/backup-suite-volumes.sh --run
# Ou explicite :
BACKUP_DIR=$HOME/backups/cloudity-suite ./scripts/ops/backup-suite-volumes.sh --run
```

Wrapper : `scripts/ops/vps-suite-prepare.sh` (crée `cloudity-bridge` + dry-run ; `--backup` pour archiver).

Volumes ciblés (noms stables) : `gasoil_api_data`, `ytmusic_ytmusic_data`, `jobbingtrack-prod_postgres_data`, `cloudity_postgres_data`, `cloudity_mobile_data`.

**Jamais** : `docker volume prune`, Remove de ces volumes, restore sans smoke login.

Étape **non codée** (à noter) : restic chiffré → S3 / stockage externe. Archive `ytmusic_ytmusic_data` (~22G) hors heures.

---

## 2. Rollback submodule cassé

Si un bump `products/YTMusic` (ou autre) casse `main` / `dev` Cloudity :

```bash
cd /home/pactivisme/Documents/Dev/Perso/Cloudity/Cloudity
# Revenir au SHA précédent du submodule
git log -5 --oneline -- products/YTMusic
git checkout <commit-cloudity-avant-bump> -- products/YTMusic
git submodule update --init --recursive
git commit -m "revert: bump YTMusic cassé"
# Ou reset du submodule à un tag connu :
cd products/YTMusic && git fetch && git checkout <bon-sha> && cd ../..
git add products/YTMusic && git commit -m "fix: pin YTMusic to known-good"
```

Règle : **ne jamais** forcer un rebuild de toutes les stacks Portainer pour un bump submodule Cloudity (voir §4).

---

## 3. `.env` & secrets (multi-root Cursor)

| Lieu | Quoi | Versionné ? |
|------|------|-------------|
| Chaque satellite | `.env.example` | **oui** |
| Chaque satellite | `.env` / `.env.local` / `stack.env` local | **non** |
| Cloudity racine | `deploy/portainer/stack.env` (prod VPS) | **non** (souvent gitignored / secrets manager) |
| Suite | `.env.suite` (optionnel, chemins API locaux) | **non** |

Pas de secrets partagés dans le workspace multi-root : chaque racine Cursor lit **son** `.env`.  
SSO plus tard : secrets OIDC uniquement dans `auth-service` + flag `CLOUDITY_SSO_ENABLED` côté app.

---

## 4. CI/CD — qui rebuild quoi ?

| Événement | Effet attendu |
|-----------|----------------|
| Push `JobbingTrack` / `GasoilTracking` / `YTMusic` | **CI du repo satellite uniquement** (image / APK / tests de ce produit) |
| Push / bump submodule dans `Cloudity` | **Ne reconstruit pas** les images satellites par défaut — docs + pointeur SHA seulement |
| Deploy Portainer | Stack Git du **produit** (webhook / pull de *son* repo), pas un mega-build Cloudity |

Éviter : pipeline Cloudity qui rebuild JT+Gasoil+PLM à chaque bump.

---

## 5. Réseau Docker VPS (anticipation hub)

Stacks restent séparées. Pour plus tard (hub ↔ APIs sans ports host inutiles) :

```bash
docker network create cloudity-bridge   # une fois sur le VPS
# Puis attach optionnel des services (label / compose external network)
```

Aujourd’hui : communication via **sous-domaines** NPM/Traefik (`*.delhomme.ovh`).  
`cloudity-bridge` = option quand le hub appellera les APIs en interne.

---

## 6. Contrat JWT minimal (SSO opt-in)

Voir aussi [`CLOUDITY-AUTH-PLM.md`](CLOUDITY-AUTH-PLM.md).

| Champ | Rôle |
|-------|------|
| `iss` | URL auth-service Cloudity |
| `aud` | `ytmusic` \| `gasoil` \| `jobbingtrack` \| `cloudity` |
| `sub` | `cloudity_user_id` |
| `email` | email normalisé (lien compte) |

Satellite : valide signature JWKS Cloudity **si** `CLOUDITY_SSO_ENABLED` ; sinon ignore et utilise **sa** table users / rôles.  
Lien : table `identity_app_links` (migration `50-identity-app-links.sql`) — pas de fusion forcée des bases.

---

## 7. Intégrations OSS futures (Trello, etc.)

Même modèle que les satellites : **repo ou dossier `products/` dédié**, stack Portainer isolée, pas de secrets dans Cloudity parent, tuile hub + OIDC opt-in plus tard.
