# Images GHCR ↔ services Cloudity

Registry : `ghcr.io/paveldelhomme/` (owner **minuscules**).

| Image | Conteneur | Compose service | Catégorie |
|-------|-----------|-----------------|-----------|
| `cloudity-frontend` | `cloudity-web` | `cloudity-web` | shell + mail + drive bundles |
| `cloudity-api-gateway` | `cloudity-api-gateway` | `api-gateway` | plateforme |
| `cloudity-auth-service` | `cloudity-auth-service` | `auth-service` | plateforme |
| `cloudity-admin-service` | `cloudity-admin-service` | `admin-service` | plateforme |
| `cloudity-mail-directory-service` | `cloudity-mail-directory-service` | `mail-directory-service` | plateforme |
| `cloudity-passwords-service` | `cloudity-passwords-service` | `passwords-service` | produit |
| `cloudity-drive-service` | `cloudity-drive-service` | `drive-service` | produit |
| `cloudity-photos-service` | `cloudity-photos-service` | `photos-service` | produit |
| `cloudity-calendar-service` | `cloudity-calendar-service` | `calendar-service` | produit |
| `cloudity-notes-service` | `cloudity-notes-service` | `notes-service` | produit |
| `cloudity-tasks-service` | `cloudity-tasks-service` | `tasks-service` | produit |
| `cloudity-contacts-service` | `cloudity-contacts-service` | `contacts-service` | produit |
| `cloudity-db-migrate` | `cloudity-db-migrate` | `db-migrate` | one-shot (Exited 0 = OK) |

## Tags par branche (CI)

| Branche Git | Tags poussés |
|-------------|--------------|
| `prod` | `:latest` · `:prod` · `:sha-…` |
| `preprod` | `:preprod` · `:sha-…` |
| `dev` | `:dev` · `:sha-…` |

Portainer stack prod : `TAG=latest` · preprod : `TAG=preprod`.

## Déploiement par bloc

| Besoin | Local | Portainer / VPS |
|--------|-------|-----------------|
| Front (shell+mail+drive) | `make deploy-web` | recreate `cloudity-web` après push `cloudity-frontend` |
| Gateway | `make deploy-gateway` | recreate `cloudity-api-gateway` |
| Auth | `make deploy-auth` | recreate `cloudity-auth-service` |
| Un service Go | `make deploy-service SERVICE=…` | recreate le conteneur homonyme |
| Migrations | `make migrate` | redeploy stack (relance `db-migrate`) ou one-shot |

Workflow : `.github/workflows/docker-publish.yml` · Doc : [`DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md).
