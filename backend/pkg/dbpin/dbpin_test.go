package dbpin

import (
	"context"
	"database/sql"
	"testing"
)

// stubExec implémente DbExec pour vérifier le fallback de `From`. Les méthodes
// retournent des valeurs nulles : on ne teste que la sélection (épinglée vs
// fallback), pas l'exécution SQL.
type stubExec struct{ tag string }

func (s *stubExec) QueryRow(string, ...any) *sql.Row          { return nil }
func (s *stubExec) Query(string, ...any) (*sql.Rows, error)   { return nil, nil }
func (s *stubExec) Exec(string, ...any) (sql.Result, error)   { return nil, nil }
func (s *stubExec) Begin() (*sql.Tx, error)                   { return nil, nil }

func TestFrom_NoPinnedConn_ReturnsFallback(t *testing.T) {
	fallback := &stubExec{tag: "pool"}
	got := From(context.Background(), fallback)
	if got != fallback {
		t.Fatalf("From sans Conn épinglée doit renvoyer le fallback, got %#v", got)
	}
}

func TestFrom_NilContext_ReturnsFallback(t *testing.T) {
	fallback := &stubExec{tag: "pool"}
	got := From(nil, fallback) //nolint:staticcheck
	if got != fallback {
		t.Fatalf("From(nil, fallback) doit renvoyer le fallback, got %#v", got)
	}
}

func TestFrom_WithPinnedConn_ReturnsPinned(t *testing.T) {
	pinned := &Conn{}
	ctx := WithConn(context.Background(), pinned)
	got := From(ctx, &stubExec{tag: "pool"})
	if got != pinned {
		t.Fatalf("From doit renvoyer la Conn épinglée, got %#v", got)
	}
}

func TestWithConn_DoesNotMutateParent(t *testing.T) {
	pinned := &Conn{}
	parent := context.Background()
	child := WithConn(parent, pinned)

	if From(parent, nil) != nil {
		t.Fatal("le parent ctx doit rester sans Conn épinglée")
	}
	if From(child, nil) != pinned {
		t.Fatal("le child ctx doit contenir la Conn épinglée")
	}
}

// TestPinKeyTypeIsolation vérifie qu'une autre clé du même nom dans un autre
// paquet ne collisionne pas. On simule une clé de type différent : From doit
// renvoyer le fallback car le type assert sur *Conn échoue.
func TestPinKeyTypeIsolation(t *testing.T) {
	type otherKey struct{}
	ctx := context.WithValue(context.Background(), otherKey{}, &stubExec{tag: "intrus"})
	fallback := &stubExec{tag: "pool"}
	if got := From(ctx, fallback); got != fallback {
		t.Fatalf("clé étrangère ne doit pas être interprétée comme une Conn épinglée, got %#v", got)
	}
}
