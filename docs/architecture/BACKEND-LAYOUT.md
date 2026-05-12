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

## 4. `backend/pkg/dbpin` — module Go partagé (Phase 0)

Depuis la **Phase 0 multi-repo** (cf. **[MULTI-REPO-LAYOUT.md](MULTI-REPO-LAYOUT.md)** § 4 et **[../decisions/multi-repo/REPONSES.md](../decisions/multi-repo/REPONSES.md)** Q10=A), il existe un module Go partagé :

```
backend/pkg/dbpin/
├── go.mod          module github.com/pavel/cloudity/pkg/dbpin
├── dbpin.go        DbExec, Conn, NewConn, WithConn, From
└── dbpin_test.go
```

API exportée :

| Symbole | Rôle |
|---------|------|
| `dbpin.DbExec` | interface (parité `*sql.DB`, `*sql.Tx`, `*Conn`) |
| `dbpin.Conn` | adaptateur `*sql.Conn` → `DbExec` avec `ctx` épinglé |
| `dbpin.NewConn(conn, ctx)` | constructeur |
| `dbpin.WithConn(ctx, p)` | injecte la conn épinglée dans `ctx` |
| `dbpin.From(ctx, fallback)` | renvoie la conn épinglée ou le fallback |

### 4.1 Statut de migration des services

| Service | Statut | Migration |
|---------|--------|-----------|
| `drive-service` | copie locale `dbpin.go` | **TODO** (PR dédiée : volume Compose + replace go.mod + wrapper local) |
| `photos-service` | copie locale | **TODO** |
| `contacts-service` | copie locale | **TODO** |
| `notes-service` | copie locale | **TODO** |
| `calendar-service` | copie locale | **TODO** |
| `tasks-service` | copie locale | **TODO** |

Les 6 copies locales sont **MD5-identiques** à l'API exposée par le module partagé : le bascule se fera service par service en remplaçant le `dbpin.go` local par un mince wrapper :

```go
// backend/<service>/dbpin.go (cible après migration)
package main

import (
	"context"
	"github.com/pavel/cloudity/pkg/dbpin"
)

type pinnedConn = dbpin.Conn

func newPinnedConn(conn *sql.Conn, ctx context.Context) *pinnedConn {
	return dbpin.NewConn(conn, ctx)
}

var withPinnedConn = dbpin.WithConn

func (h *Handler) dbex(ctx context.Context) dbpin.DbExec {
	return dbpin.From(ctx, h.db)
}
```

Plus l'ajustement Docker (au choix) :

- **(a)** ajouter dans `docker-compose.yml` un volume `- ./backend/pkg:/app/pkg:cached` + `replace github.com/pavel/cloudity/pkg/dbpin => ./pkg/dbpin` dans le `go.mod` du service ;
- **(b)** élargir le contexte de build à `./backend/` + adapter les `COPY` du Dockerfile (plus invasif).

### 4.2 Pourquoi pas une bascule en bloc ?

L'étape Docker (a) ou (b) modifie le **build conteneur** de chaque service ; en cas de bug, on prend le risque d'une stack rouge en dev. La **règle Phase 0** est de **n'avancer qu'avec un service pilote** (drive-service), valider en `make rebuild` complet, puis propager. Voir todo dédiée dans **[../../BACKLOG.md](../../BACKLOG.md)**.

## 5. Checks après ajout ou renommage d’un service

1. **`go.work`** : ajouter `./backend/<nouveau-service>`.
2. **`docker-compose.yml`** : service, `build.context`, `depends_on` du gateway si health requis.
3. **`backend/api-gateway/main.go`** : entrée `services` (URL `http://<nom-service>:<port>`).
4. **`Makefile`** / **`scripts/ci/test-security.sh`** / **`scripts/dev/install-deps.sh`** / **`scripts/dev/status.sh`**.
5. **Documentation** : `STATUS.md`, `TESTS.md`, `MTLS-INTERNE.md` si mTLS prévu.

---

*À mettre à jour lors d’un refactor `pkg/dbpin` ou d’un renommage de service.*
