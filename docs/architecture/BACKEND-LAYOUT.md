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

## 5. Conventions de tests : Go vs Python

> **Objectif** : ne plus se demander *« pourquoi tel `_test.go` est à côté de
> `main.go` plutôt que dans un dossier `tests/` ? »*. Réponse : c'est une
> contrainte du **langage**, pas un choix d'équipe.

### 5.1 Tests Go — `*_test.go` **colocalisés** avec le code testé (obligatoire)

Tous les `*_test.go` des services Go (`auth-service`, `api-gateway`,
`mail-directory-service`, `passwords-service`, `drive-service`, …) **doivent
rester dans le même dossier** que le code qu'ils testent. Quatre raisons
techniques :

1. **Même `package`** : un test fait `package main` ou `package monservice`,
   identique au fichier testé. Déplacer le test dans `tests/` (= autre
   package) ferait perdre l'accès aux **symboles non exportés**
   (`func helper()`, types `lowerCase`, constantes privées).
2. **`go test ./...`** descend dans chaque dossier de package : un test
   isolé hors du package ne sera plus exécuté tel quel.
3. **Couverture** : `go test -cover` rapporte la couverture **par package**.
   Sortir les tests casse le mapping fichier-source ↔ fichier-test que
   l'outil utilise.
4. **`internal/` package** : Go interdit l'import de `internal/foo` depuis
   un dossier qui n'est pas un parent. Un dossier `tests/` au-dessus du
   service ne pourrait pas importer ses internals.

Exemple concret (auth-service) — toute cette liste est **correcte** :

```
backend/auth-service/
  main.go
  main_test.go
  main_keys_test.go
  main_mtls_test.go
  recovery_codes.go
  recovery_codes_test.go
  webauthn.go
  webauthn_user.go
  webauthn_session.go
  webauthn_register.go
  webauthn_login.go
  webauthn_credentials.go
  webauthn_auth.go
  webauthn_test.go
  securetoken_hmac.go
  securetoken_http.go
  securetoken_test.go
  routes.go
```

### 5.2 Tests d'intégration **inter-services** — `internal/integration/` (futur)

Lorsqu'on aura besoin de tests qui orchestrent plusieurs services
(ex. *« le gateway vers auth-service vers passwords-service »* en
black-box HTTP), ils iront dans un sous-package dédié, par exemple
`backend/internal/integration/` ou `tests/integration/` à la racine du
dépôt. Ils ne **remplacent pas** les `*_test.go` colocalisés : ils
s'ajoutent. À mettre en place uniquement quand un vrai besoin existe
(pas avant).

### 5.3 Tests Python — dossier `tests/` séparé (admin-service)

Côté Python, **pytest** suit la convention inverse : tests dans un
dossier dédié, nommés `test_*.py`. Le code applicatif est désormais
regroupé dans `app/` (depuis le refactor du 13/05/2026) :

```
backend/admin-service/
  app/
    __init__.py
    main.py                     # FastAPI app
    core/
      __init__.py
      database.py               # engine SQLAlchemy + get_db()
    models.py                   # ORM (Tenant, User)
    schemas.py                  # Pydantic
    routes/
      __init__.py
      health.py
      tenants.py
      users.py
      stats.py
      security.py
    services/
      __init__.py
      cve_scanner.py            # OSV scanner
  tests/
    __init__.py
    test_health.py
    test_tenants.py
    test_users.py
    test_stats.py
    test_cve_scanner.py
  Dockerfile
  Dockerfile.dev
  Dockerfile.prod
  pytest.ini                    # pythonpath = .  → import "app.main"
  start.sh                      # uvicorn app.main:app …
  requirements.txt
```

**Imports absolus partout** : `from app.core.database import get_db`,
`from app.models import User`, `from app.services.cve_scanner import …`.
Les imports plats (`from database import …`) ont été supprimés.

CMD uvicorn : `uvicorn app.main:app …` (Dockerfile, Dockerfile.dev avec
`--reload-dir /app/app`, `start.sh` HTTP plain et TLS mTLS).

## 7. `internalsec` vs dossiers vides locaux (Docker)

| Chemin | Rôle |
|--------|------|
| **`backend/internalsec/`** (versionné) | **Bibliothèque Go** mTLS inter-services (`internalsec.go`, tests, `VERSION`, `CHANGELOG`). **À conserver.** Importée via `replace` dans chaque `go.mod` ; montée dans les conteneurs sur `/app/internalsec`. |
| **`backend/auth-service/internalsec/`**, **`backend/api-gateway/keys/`**, etc. (vides, souvent `root:root`) | **Artefacts locaux** créés par des bind-mounts Docker mal résolus ou d’anciennes configs. **Ne pas versionner** — supprimer avec `sudo rm -rf` si présents. Ignorés via `.gitignore`. |
| **`backend/auth-service backend/`** (nom avec espace) | **Erreur** (typo `mkdir` / chemin Windows `\ ` / volume mal formé). Chaîne de sous-dossiers imbriqués sans fichiers. **Supprimer entièrement.** |

**Gateway → clés JWT** : en dev, `docker-compose.yml` monte uniquement
`public.pem` et `public_ed25519.pem` depuis `auth-service` vers
`/app/keys/` (plus le dossier auth-service entier).

**Données runtime** (mail, photos, drive) : les blobs utilisateur vivent dans
**PostgreSQL** + volumes Compose nommés / object storage — pas dans des
sous-dossiers vides sous `backend/*-service/`. Le code métier (`image_decode.go`,
`mail_storage.go`, `photos_match.go` dans `drive-service`) reste **dans le
service** : ce sont des **fichiers Go**, pas des images Docker séparées.

## 8. Réorganisation progressive (auth, drive, …)

**auth-service (fait)** — packages extraits, tests verts (`go test ./...`) :

```
backend/auth-service/
  webauthn/      # passkeys (AuthBridge → main.webauthnBridge)
  recovery/      # codes 2FA
  securetoken/   # capability URLs HMAC
  securetoken_http.go, recovery_http.go, webauthn_bridge.go  # handlers Gin (package main)
```

Les autres services (ex. **drive-service** : `image_decode.go`, `mail_storage.go`)
suivent encore le modèle **« tout en `main` + fichiers préfixés »** — extraction
**service par service** après validation tests + Docker. Voir **[BACKLOG.md](../../BACKLOG.md)**
et **[MULTI-REPO-LAYOUT.md](MULTI-REPO-LAYOUT.md)** pour le découpage et le
versionnage par image (`ghcr.io/.../cloudity-<service>`).

**Déploiement opérationnel** : `make deploy-service SERVICE=auth-service` (compose local),
`.github/workflows/docker-publish.yml` → `ghcr.io/<owner>/cloudity-<service>:<tag>`,
doc `docs/operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md`.

## 9. Checks après ajout ou renommage d’un service

1. **`go.work`** : ajouter `./backend/<nouveau-service>`.
2. **`docker-compose.yml`** : service, `build.context`, `depends_on` du gateway si health requis.
3. **`backend/api-gateway/main.go`** : entrée `services` (URL `http://<nom-service>:<port>`).
4. **`Makefile`** / **`scripts/ci/test-security.sh`** / **`scripts/dev/install-deps.sh`** / **`scripts/dev/status.sh`**.
5. **Documentation** : `STATUS.md`, `TESTS.md`, `MTLS-INTERNE.md` si mTLS prévu.

---

*À mettre à jour lors d’un refactor `pkg/dbpin`, d’un renommage de service,
ou d’une évolution de la structure `backend/admin-service/app/`.*
