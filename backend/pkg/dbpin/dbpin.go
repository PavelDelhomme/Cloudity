// Package dbpin fournit l'utilitaire « pinned connection » utilisé par tous
// les microservices Cloudity Go pour garantir que les paramètres de session
// PostgreSQL posés dans le middleware (`set_config('app.current_user_id', …)`,
// `set_current_tenant(…)`, …) restent effectifs sur la même connexion physique
// pendant toute la durée d'une requête HTTP.
//
// Sans ce mécanisme, `*sql.DB` rend une connexion arbitraire du pool : il y a
// tirage à pile ou face entre un `Exec("SET …")` sur la conn A et un
// `QueryRow("SELECT … current_setting('app.current_user_id') …")` sur la
// conn B → résultats inconsistants, RLS qui ne s'applique pas, 404/500
// fantômes en charge ou après plusieurs requêtes.
//
// Pattern d'usage côté microservice (drive-service, photos-service, …) :
//
//	// Dans le middleware (typiquement requireUserID) :
//	conn, err := h.db.Conn(ctx)
//	if err != nil { /* … */ }
//	defer conn.Close()
//	if _, err := conn.ExecContext(ctx, `SELECT set_config('app.current_user_id', $1, true)`, uid); err != nil { /* … */ }
//	pin := dbpin.NewConn(conn, ctx)
//	c.Request = c.Request.WithContext(dbpin.WithConn(ctx, pin))
//
//	// Dans le handler :
//	rows, err := dbpin.From(c.Request.Context(), h.db).Query(`SELECT …`)
//
// Historique : ce code était auparavant dupliqué à l'identique dans 6
// services (`drive-service`, `photos-service`, `contacts-service`,
// `notes-service`, `calendar-service`, `tasks-service`). Phase 0 du plan
// multi-repo (Q10=A) en a fait un module partagé. Voir
// docs/architecture/MULTI-REPO-LAYOUT.md § 4.
package dbpin

import (
	"context"
	"database/sql"
)

// DbExec couvre la surface utilisée par les handlers (parité avec *sql.DB).
// Les types `*sql.DB`, `*sql.Conn` (via Conn ci-dessous) et `*sql.Tx`
// satisfont implicitement cette interface.
type DbExec interface {
	QueryRow(query string, args ...any) *sql.Row
	Query(query string, args ...any) (*sql.Rows, error)
	Exec(query string, args ...any) (sql.Result, error)
	Begin() (*sql.Tx, error)
}

// Conn adapte *sql.Conn vers DbExec en injectant un context.Context fixé
// (celui de la requête HTTP). Drop-in pour `*sql.DB`.
type Conn struct {
	conn *sql.Conn
	ctx  context.Context
}

// NewConn enveloppe une *sql.Conn déjà acquise et préparée (set_config posé)
// dans un Conn épinglé. Le ctx fourni est utilisé pour TOUTES les requêtes
// suivantes : passe celui de la requête HTTP courante.
func NewConn(conn *sql.Conn, ctx context.Context) *Conn {
	return &Conn{conn: conn, ctx: ctx}
}

// QueryRow implémente DbExec.
func (p *Conn) QueryRow(q string, args ...any) *sql.Row {
	return p.conn.QueryRowContext(p.ctx, q, args...)
}

// Query implémente DbExec.
func (p *Conn) Query(q string, args ...any) (*sql.Rows, error) {
	return p.conn.QueryContext(p.ctx, q, args...)
}

// Exec implémente DbExec.
func (p *Conn) Exec(q string, args ...any) (sql.Result, error) {
	return p.conn.ExecContext(p.ctx, q, args...)
}

// Begin implémente DbExec.
func (p *Conn) Begin() (*sql.Tx, error) {
	return p.conn.BeginTx(p.ctx, nil)
}

// pinKey est la clé context.Context pour la conn épinglée. Type privé pour
// éviter toute collision inter-paquets.
type pinKey struct{}

// WithConn renvoie une copie de ctx contenant la conn épinglée. À placer
// dans le middleware une fois `set_config` appliqué sur la *sql.Conn.
func WithConn(ctx context.Context, p *Conn) context.Context {
	return context.WithValue(ctx, pinKey{}, p)
}

// From retourne la conn épinglée présente dans le ctx (posée par
// `WithConn` côté middleware), sinon le `fallback` (typiquement le pool
// `*sql.DB` du Handler).
//
// Les handlers HTTP doivent récupérer ctx via `c.Request.Context()` puis
// appeler `dbpin.From(ctx, h.db)` — JAMAIS `h.db` directement sous peine
// de perdre le set_config et de basculer sur une autre connexion du pool.
func From(ctx context.Context, fallback DbExec) DbExec {
	if ctx == nil {
		return fallback
	}
	if v := ctx.Value(pinKey{}); v != nil {
		if p, ok := v.(*Conn); ok {
			return p
		}
	}
	return fallback
}
