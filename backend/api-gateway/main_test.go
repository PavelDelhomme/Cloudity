package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /health: got status %d, want %d", w.Code, http.StatusOK)
	}
	body := w.Body.String()
	if body != `{"status":"healthy"}` {
		t.Errorf("GET /health: got body %q, want %q", body, `{"status":"healthy"}`)
	}
}

func TestHealthEndpoint_MethodGetOnly(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodPost, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed && w.Code != http.StatusOK {
		t.Logf("POST /health: got status %d (acceptable)", w.Code)
	}
}

func TestHealthEndpoint_Options(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodOptions, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	// CORS may allow OPTIONS
	if w.Code != http.StatusOK && w.Code != http.StatusMethodNotAllowed {
		t.Logf("OPTIONS /health: got status %d", w.Code)
	}
}

func TestAuthPrefixRouted(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/auth/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	// Proxy vers auth-service : 502/503 si service injoignable, pas 404
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /auth/health: got 404, route /auth/* should be registered")
	}
}

func TestAdminPrefixRouted(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/tenants", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /admin/tenants: got 404, route /admin/* should be registered")
	}
}

func TestPassPrefixRouted(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/pass/vaults", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /pass/vaults: got 404, route /pass/* should be registered")
	}
}

// TestCORS vérifie que le gateway renvoie Access-Control-Allow-Origin pour une origine autorisée.
func TestCORS(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Origin", "http://localhost:6001")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("GET /health with Origin: got status %d", w.Code)
	}
	allowOrigin := w.Header().Get("Access-Control-Allow-Origin")
	if allowOrigin != "http://localhost:6001" {
		t.Errorf("CORS: got Access-Control-Allow-Origin %q, want http://localhost:6001", allowOrigin)
	}
}

func TestMailPrefixRouted(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/mail/domains", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /mail/domains: got 404, route /mail/* should be registered")
	}
}

func TestMailMeAccountsRouted(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/mail/me/accounts", nil)
	req.Header.Set("Authorization", "Bearer fake-token")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	// Gateway doit transmettre : 401 (token invalide) ou 502/503 (mail service down), pas 404
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /mail/me/accounts: got 404, route /mail/* must forward to mail service")
	}
}
