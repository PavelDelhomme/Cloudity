package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestInternalAliasResolve_RejectsWithoutToken(t *testing.T) {
	t.Setenv("MTA_INTERNAL_TOKEN", "test-mta-secret-token-32chars")
	r := setupRouter(nil)
	body, _ := json.Marshal(map[string]string{"alias_email": "a@alias.example"})
	req := httptest.NewRequest(http.MethodPost, "/mail/internal/alias-resolve", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", w.Code)
	}
}

func TestInternalAliasResolve_RejectsWhenTokenNotConfigured(t *testing.T) {
	os.Unsetenv("MTA_INTERNAL_TOKEN")
	r := setupRouter(nil)
	body, _ := json.Marshal(map[string]string{"alias_email": "a@alias.example"})
	req := httptest.NewRequest(http.MethodPost, "/mail/internal/alias-resolve", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-MTA-Internal-Token", "anything")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("got %d, want 401", w.Code)
	}
}

func TestMtaInternalTokenOK_HeaderVariants(t *testing.T) {
	t.Setenv("MTA_INTERNAL_TOKEN", "secret-token")
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
	c.Request.Header.Set("X-MTA-Internal-Token", "secret-token")
	if !mtaInternalTokenOK(c) {
		t.Fatal("expected X-MTA-Internal-Token to match")
	}
	c.Request.Header.Del("X-MTA-Internal-Token")
	c.Request.Header.Set("Authorization", "Bearer secret-token")
	if !mtaInternalTokenOK(c) {
		t.Fatal("expected Bearer to match")
	}
}
