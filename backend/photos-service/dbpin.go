package main

// dbpin.go — pattern partagé entre tous les services Go Cloudity pour garantir
// que les paramètres de session PostgreSQL posés dans le middleware
// (`set_config('app.current_user_id', ...)`, `set_current_tenant(...)`, …) sont
// effectifs sur la même connexion physique que les requêtes SQL des handlers.
//
// Sans ce mécanisme, `*sql.DB` rend une connexion arbitraire du pool : il y a
// tirage à pile ou face entre un `Exec("SET...")` sur la conn A et un
// `QueryRow("SELECT ... current_setting('app.current_user_id') ...")` sur la
// conn B → résultats inconsistants, RLS qui ne s'applique pas, 404/500
// fantômes en charge ou après plusieurs requêtes.
//
// Pattern : le middleware acquiert une `*sql.Conn` dédiée, applique le
// `set_config`, l'épingle dans `c.Request.Context()` via `withPinnedConn`,
// puis relâche la connexion (`conn.Close()`) après `c.Next()`. Tous les
// handlers récupèrent l'exécuteur via `h.dbex(ctx)` et ne touchent JAMAIS
// `h.db` directement.
//
// Ce fichier est volontairement copié à l'identique dans chaque service plutôt
// que d'être centralisé dans un module Go partagé : Docker construit chaque
// service à partir de `./backend/<svc>` et ignore `go.work`. Dupliquer 60 lignes
// est un compromis pragmatique pour éviter de modifier 7 Dockerfiles + go.mod.

import (
	"context"
	"database/sql"
)

// dbExec couvre la surface utilisée par les handlers (parité avec *sql.DB).
type dbExec interface {
	QueryRow(query string, args ...any) *sql.Row
	Query(query string, args ...any) (*sql.Rows, error)
	Exec(query string, args ...any) (sql.Result, error)
	Begin() (*sql.Tx, error)
}

// pinnedConn adapte *sql.Conn vers dbExec en injectant un context.Context fixé
// (celui de la requête HTTP). Drop-in pour h.db.
type pinnedConn struct {
	conn *sql.Conn
	ctx  context.Context
}

func (p *pinnedConn) QueryRow(q string, args ...any) *sql.Row {
	return p.conn.QueryRowContext(p.ctx, q, args...)
}

func (p *pinnedConn) Query(q string, args ...any) (*sql.Rows, error) {
	return p.conn.QueryContext(p.ctx, q, args...)
}

func (p *pinnedConn) Exec(q string, args ...any) (sql.Result, error) {
	return p.conn.ExecContext(p.ctx, q, args...)
}

func (p *pinnedConn) Begin() (*sql.Tx, error) {
	return p.conn.BeginTx(p.ctx, nil)
}

// pinKey est la clé context.Context pour la conn épinglée (type privé pour
// éviter toute collision inter-paquets).
type pinKey struct{}

// withPinnedConn renvoie une copie de ctx contenant la conn épinglée.
func withPinnedConn(ctx context.Context, p *pinnedConn) context.Context {
	return context.WithValue(ctx, pinKey{}, p)
}

// dbex retourne la conn épinglée présente dans le ctx (posée par le middleware
// requireUserID), sinon le pool *sql.DB. Les handlers HTTP doivent récupérer
// ctx via c.Request.Context() puis appeler h.dbex(ctx) — JAMAIS h.db
// directement, sous peine de perdre le set_config et de basculer sur une autre
// connexion du pool.
func (h *Handler) dbex(ctx context.Context) dbExec {
	if ctx != nil {
		if v := ctx.Value(pinKey{}); v != nil {
			if p, ok := v.(*pinnedConn); ok {
				return p
			}
		}
	}
	return h.db
}
