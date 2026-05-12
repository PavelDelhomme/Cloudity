# Changelog — pkg/dbpin

Toutes les modifications notables du module Go `github.com/pavel/cloudity/pkg/dbpin` sont consignées ici. Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnage : [SemVer](https://semver.org/lang/fr/).

> Convention : tant que la lib n'est pas publiée sur l'org GitHub définitive (cf. **REPONSES.md** Q4=B), aucun tag Git `pkg/dbpin/v*` n'est poussé. Les versions sont déclarées ici et appliquées en tags **dès que l'org cible est fixée**.

## [0.1.0] — 2026-05-12

Première version stable du module partagé pour l'épinglage de connexion PostgreSQL (« pinned connection »). Utilisé par les microservices Go Cloudity (drive, photos, contacts, notes, calendar, tasks) pour garantir que les variables de session PostgreSQL (`set_config('app.current_user_id', …)`, RLS) restent cohérentes entre middleware et handlers.

Cf. **[../../../docs/architecture/VERSIONNAGE-LIBS.md](../../../docs/architecture/VERSIONNAGE-LIBS.md)** pour le contexte et **[../../../docs/architecture/BACKEND-LAYOUT.md](../../../docs/architecture/BACKEND-LAYOUT.md)** § 4 pour l'usage.

### API exportée

- `dbpin.DbExec` — interface compatible `*sql.DB` / `*sql.Conn` / `*sql.Tx` (méthodes `QueryRow`, `Query`, `Exec`, `Begin`).
- `dbpin.Conn` — adaptateur `*sql.Conn` → `DbExec` avec `context.Context` épinglé.
- `dbpin.NewConn(conn, ctx)` — constructeur.
- `dbpin.WithConn(ctx, p)` — injecte la conn épinglée dans `context.Context`.
- `dbpin.From(ctx, fallback)` — renvoie la conn épinglée du ctx, sinon le fallback (typiquement `*sql.DB`).

### Statut migration des services

- Module créé et référencé dans `go.work`.
- Aucun service n'utilise encore le module (les 6 copies locales `backend/<svc>/dbpin.go` restent en place).
- Migration service par service prévue (cf. **BACKEND-LAYOUT.md § 4.1**).

### Garanties

- API stable jusqu'à v0.2.0 (changements compatibles uniquement) ou v1.0.0 (signal de stabilité long terme).
- Aucune dépendance externe (uniquement `database/sql` + `context` de la stdlib).
- Couverture : 5 tests dans `dbpin_test.go` (fallback, ctx nil, propagation, isolation `pinKey` privée).

---

*Format des entrées suivantes : `## [X.Y.Z] — YYYY-MM-DD` avec sections `Ajouté`, `Modifié`, `Déprécié`, `Retiré`, `Corrigé`, `Sécurité`.*
