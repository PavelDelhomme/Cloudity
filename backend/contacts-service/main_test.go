package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	r := setupRouter(nil)
	for _, path := range []string{"/health", "/contacts/health"} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		r.ServeHTTP(w, req)
		if w.Code != http.StatusOK {
			t.Errorf("%s: got %d", path, w.Code)
		}
	}
}

func TestContactsRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/contacts", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /contacts without X-User-ID: got %d", w.Code)
	}
}

func TestListContactsWithUserNoDB(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/contacts", nil)
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("GET /contacts with X-User-ID, db=nil: got %d", w.Code)
	}
}
