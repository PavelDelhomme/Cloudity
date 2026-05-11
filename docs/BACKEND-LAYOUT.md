# Backend Cloudity — conventions de dossiers et de modules Go

**Rôle** : une **seule norme de nommage** pour les microservices Go (et les exceptions documentées), plus des pistes pour la **structure du code** au-delà d’un `main.go` monolithique.

## 1. Nommage des services

| Dossier sous `backend/` | Type | Règle |
|-------------------------|------|--------|
| `*-service` | Microservice HTTP exposé derrière **api-gateway** | Nom **kebab-case** aligné sur le **DNS Docker** (ex. `photos-service`, `passwords-service`, `mail-directory-service`). |
| `api-gateway` | Passerelle unique | Nom historique conservé (pas de suffixe `-service`). |
| `internalsec` | **Bibliothèque** Go partagée (mTLS, helpers) | Pas un conteneur : module `github.com/pavel/cloudity/internalsec` ; les services l’importent via `replace` dans leur `go.mod` + **COPY** dans le Dockerfile si besoin. |
| `admin-service` | API **Python** (FastAPI) | Exception stack ; suffixe `-service`. |

**Pass / coffres** : le service Go s’appelle **`passwords-service`** (dossier `backend/passwords-service`, image Docker `passwords-service`, routes inchangées **`/pass/*`** côté gateway pour ne pas casser les clients).

## 2. Module Go (`go.mod`)

- Forme : `module github.com/pavel/cloudity/<nom-du-dossier>` (ex. `github.com/pavel/cloudity/passwords-service`).
- Le fichier **`go.work`** à la racine du dépôt référence chaque module pour l’IDE et `go test` local.

## 3. Structure interne d’un service Go (cible)

Aujourd’hui plusieurs services concentrent encore toute la logique dans **`main.go`**. La cible progressive :

```
backend/foo-service/
  main.go              # wiring : env, DB, router Gin/Mux, enregistrement des handlers
  handlers_*.go        # ou dossier handlers/ par domaine
  db.go                # ou store/ : accès SQL
  middleware.go
  go.mod
  Dockerfile.dev
  main_test.go
```

Les handlers doivent passer par **`h.dbex(ctx)`** (connexion PostgreSQL **épinglée** sur la requête HTTP) — voir commentaire en tête de `dbpin.go` dans chaque service.

## 4. `dbpin.go` dupliqué entre services

Les fichiers `dbpin.go` sont **copiés** à l’identique dans plusieurs services : le **build Docker** utilise le contexte **`./backend/<service>`** seul (sans `go.work`), ce qui rend un module partagé **`pkg/dbpin`** non trivial sans :

- soit élargir le **contexte** Compose à `./backend` et adapter chaque `Dockerfile.dev` (COPY `pkg/` + service) ;
- soit publier un module interne.

**Piste** : introduire `backend/pkg/dbpin` + `go.work` + Dockerfiles multi-`COPY` — à planifier dans une PR dédiée pour limiter le risque.

## 5. Checks après ajout ou renommage d’un service

1. **`go.work`** : ajouter `./backend/<nouveau-service>`.
2. **`docker-compose.yml`** : service, `build.context`, `depends_on` du gateway si health requis.
3. **`backend/api-gateway/main.go`** : entrée `services` (URL `http://<nom-service>:<port>`).
4. **`Makefile`** / **`scripts/ci/test-security.sh`** / **`scripts/dev/install-deps.sh`** / **`scripts/dev/status.sh`**.
5. **Documentation** : `STATUS.md`, `TESTS.md`, `MTLS-INTERNE.md` si mTLS prévu.

---

*À mettre à jour lors d’un refactor `pkg/dbpin` ou d’un renommage de service.*
