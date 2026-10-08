package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("health: got %d", w.Code)
	}
}

func TestNoteFoldersDedup(t *testing.T) {
	got := noteFolders([]string{" Courses ", "courses", "idées", ""})
	if len(got) != 2 || got[0] != "Courses" || got[1] != "idées" {
		t.Fatalf("got %#v", got)
	}
}

func TestNotesRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/notes", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /notes without X-User-ID: got %d", w.Code)
	}
}
