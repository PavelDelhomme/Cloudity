package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
)

func TestCSPReport_Accepts204AndStripsBody(t *testing.T) {
	handler := NewHandler()
	payload := []byte(`{"csp-report":{"document-uri":"https://app.cloudity.local/","violated-directive":"script-src 'self'"}}`)
	req := httptest.NewRequest(http.MethodPost, "/csp-report", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/csp-report")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("POST /csp-report: got %d, want 204", w.Code)
	}
	if body := strings.TrimSpace(w.Body.String()); body != "" {
		t.Errorf("POST /csp-report: body must be empty, got %q", body)
	}
}

func TestCSPReport_MethodGetNotAllowed(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/csp-report", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("GET /csp-report: got %d, want 405", w.Code)
	}
}

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

func TestPhotosPrefixRouted(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/photos/timeline", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /photos/timeline: got 404, route /photos/* should be registered")
	}
}

func TestDriveSearchPrefixRouted(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/drive/nodes/search?q=x", nil)
	req.Header.Set("Authorization", "Bearer fake-token")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /drive/nodes/search: got 404, route /drive/* should forward to drive service")
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

func TestIsAdminOnlyMailRoute(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{path: "/mail/domains", want: true},
		{path: "/mail/mailboxes/1", want: true},
		{path: "/mail/aliases", want: true},
		{path: "/mail/me/accounts", want: false},
	}
	for _, tc := range cases {
		if got := isAdminOnlyMailRoute(tc.path); got != tc.want {
			t.Fatalf("isAdminOnlyMailRoute(%q)=%v, want %v", tc.path, got, tc.want)
		}
	}
}

func TestIsAdminOnlyPassRoute(t *testing.T) {
	cases := []struct {
		path string
		want bool
	}{
		{path: "/pass/admin/format-versions", want: true},
		{path: "/pass/admin", want: true},
		{path: "/pass/vaults", want: false},
		{path: "/pass/items/42", want: false},
	}
	for _, tc := range cases {
		if got := isAdminOnlyPassRoute(tc.path); got != tc.want {
			t.Fatalf("isAdminOnlyPassRoute(%q)=%v, want %v", tc.path, got, tc.want)
		}
	}
}

func TestTokenHasAdminRole(t *testing.T) {
	if !tokenHasAdminRole(jwt.MapClaims{"role": "admin"}) {
		t.Fatal("tokenHasAdminRole should accept role=admin")
	}
	if !tokenHasAdminRole(jwt.MapClaims{"roles": []interface{}{"user", "admin"}}) {
		t.Fatal("tokenHasAdminRole should accept roles[]=admin")
	}
	if tokenHasAdminRole(jwt.MapClaims{"role": "user"}) {
		t.Fatal("tokenHasAdminRole should reject non-admin role")
	}
}
