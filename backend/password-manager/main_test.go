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

