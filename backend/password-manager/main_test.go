package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHealthEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "password-manager"})
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /health: got status %d, want 200", w.Code)
	}
	if w.Header().Get("Content-Type") != "application/json; charset=utf-8" {
		t.Errorf("GET /health: content-type = %s", w.Header().Get("Content-Type"))
	}
	if !strings.Contains(w.Body.String(), "healthy") {
		t.Errorf("GET /health: body should contain 'healthy', got %s", w.Body.String())
	}
}

func TestPassVaultsRequiresUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{db: nil}
	r := gin.New()
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	r.Use(h.requireUserID)
	r.GET("/pass/vaults", h.listVaults)

	req := httptest.NewRequest(http.MethodGet, "/pass/vaults", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /pass/vaults without X-User-ID: got status %d, want 401", w.Code)
	}
}

func TestPassVaultsRejectsInvalidUserID(t *testing.T) {
	gin.SetMode(gin.TestMode)
	h := &Handler{db: nil}
	r := gin.New()
	r.Use(h.requireUserID)
	r.GET("/pass/vaults", h.listVaults)

	req := httptest.NewRequest(http.MethodGet, "/pass/vaults", nil)
	req.Header.Set("X-User-ID", "invalid")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /pass/vaults with invalid X-User-ID: got status %d, want 401", w.Code)
	}
}

func TestValidateFormatVersion(t *testing.T) {
	cases := []struct {
		in     int
		want   int
		wantOK bool
	}{
		{0, 0, true},
		{1, 1, true},
		{2, 2, true},
		{32767, 32767, true},
		{-1, 0, false},
		{32768, 0, false},
	}
	for _, c := range cases {
		got, ok := validateFormatVersion(c.in)
		if ok != c.wantOK || got != c.want {
			t.Errorf("validateFormatVersion(%d) = (%d,%v), want (%d,%v)", c.in, got, ok, c.want, c.wantOK)
		}
	}
}

func TestCurrentFormatVersionIsEnvelopeV1(t *testing.T) {
	if currentFormatVersion != 1 {
		t.Errorf("currentFormatVersion = %d ; doit valoir 1 (EnvelopeV1, voir docs/PASS-CRYPTO.md)", currentFormatVersion)
	}
}

