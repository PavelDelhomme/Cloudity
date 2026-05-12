package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/time/rate"
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
	if got := w.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("GET /health: X-Content-Type-Options=%q, want nosniff", got)
	}
	body := w.Body.String()
	if body != `{"status":"healthy"}` {
		t.Errorf("GET /health: got body %q, want %q", body, `{"status":"healthy"}`)
	}
}

func TestUnknownPath_Returns404JSON(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/this-route-should-not-exist-9f3a2c1b", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("unknown path: status %d, want 404", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.Contains(ct, "application/json") {
		t.Errorf("unknown path: Content-Type=%q, want JSON", ct)
	}
	if !strings.Contains(w.Body.String(), "not found") {
		t.Errorf("unknown path: body=%q", w.Body.String())
	}
}

// drainAndRestoreLimiters vide les deux rate-limiters globaux pour forcer une
// réponse 429 synchrone (évite le timeout DNS du proxy en test) et installe
// de nouveaux limiteurs frais avant de rendre la main pour ne pas pénaliser
// les tests suivants.
func drainAndRestoreLimiters(t *testing.T) {
	t.Helper()
	for i := 0; i < 200; i++ {
		_ = limiter.Allow()
		_ = loginRegisterLimiter.Allow()
	}
	t.Cleanup(func() {
		limiter = rate.NewLimiter(10, 20)
		loginRegisterLimiter = rate.NewLimiter(3, 12)
	})
}

// Les réponses sur /auth/* ne doivent JAMAIS être mises en cache (tokens, hashes…).
func TestSensitivePath_NoStoreCacheControl(t *testing.T) {
	drainAndRestoreLimiters(t)
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if got := w.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("POST /auth/login: Cache-Control=%q, want no-store", got)
	}
}

// Le rate limiter dédié login/register doit répondre 429 dès que son bucket est vide.
func TestLoginRateLimit_Returns429(t *testing.T) {
	drainAndRestoreLimiters(t)
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("got %d, want 429 (login rate limiter inactive)", w.Code)
	}
	if !strings.Contains(w.Body.String(), "too many requests") {
		t.Errorf("body=%q, want JSON {\"error\":\"too many requests\"}", w.Body.String())
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
	rsaPriv, edPriv := withTestKeys(t)
	claims := makeClaims()
	claims["role"] = "admin"
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tok.Header["kid"] = kidEd25519
	signed, err := tok.SignedString(edPriv)
	if err != nil {
		t.Fatalf("sign admin jwt: %v", err)
	}
	_ = rsaPriv

	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/tenants", nil)
	req.Header.Set("Origin", "http://localhost:6001")
	req.Header.Set("Authorization", "Bearer "+signed)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code == http.StatusNotFound {
		t.Errorf("GET /admin/tenants: got 404, route /admin/* should be registered")
	}
}

func TestAdminAPI_RejectsDisallowedOrigin(t *testing.T) {
	_, edPriv := withTestKeys(t)
	claims := makeClaims()
	claims["role"] = "admin"
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tok.Header["kid"] = kidEd25519
	signed, err := tok.SignedString(edPriv)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/tenants", nil)
	req.Header.Set("Origin", "https://evil.example")
	req.Header.Set("Authorization", "Bearer "+signed)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("got %d, want 403 forbidden origin", w.Code)
	}
}

func TestAdminAPI_RequiresOriginEvenWithValidJWT(t *testing.T) {
	_, edPriv := withTestKeys(t)
	claims := makeClaims()
	claims["role"] = "admin"
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tok.Header["kid"] = kidEd25519
	signed, err := tok.SignedString(edPriv)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/admin/tenants", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("missing Origin: got %d, want 403", w.Code)
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
