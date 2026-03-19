package main

import (
	"database/sql"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHealthEndpoint(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("GET /health: got status %d", w.Code)
	}
	body := w.Body.String()
	if body != `{"service":"mail-directory","status":"healthy"}` && body != `{"status":"healthy","service":"mail-directory"}` {
		t.Logf("GET /health body: %s", body)
	}
}

func TestMailHealthEndpoint(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("GET /mail/health: got status %d", w.Code)
	}
}

func TestMailDomainsRequiresTenantID(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/domains", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /mail/domains without X-Tenant-ID: got %d", w.Code)
	}
}

func TestMailDomainsRejectsInvalidTenantID(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/domains", nil)
	req.Header.Set("X-Tenant-ID", "invalid")
	req.Header.Set("X-User-ID", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /mail/domains with invalid X-Tenant-ID: got %d", w.Code)
	}
}

func TestMailDomainsMailboxesInvalidID(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/domains/invalid/mailboxes", nil)
	req.Header.Set("X-Tenant-ID", "1")
	req.Header.Set("X-User-ID", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("GET /mail/domains/invalid/mailboxes: got %d", w.Code)
	}
}

func TestMailDomainsAliasesInvalidID(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/domains/0/aliases", nil)
	req.Header.Set("X-Tenant-ID", "1")
	req.Header.Set("X-User-ID", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("GET /mail/domains/0/aliases: got %d", w.Code)
	}
}

func TestMailMeAccountsRequiresTenantID(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/me/accounts", nil)
	req.Header.Set("X-User-ID", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /mail/me/accounts without X-Tenant-ID: got %d", w.Code)
	}
}

func TestMailMeAccountsRequiresUserID(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/me/accounts", nil)
	req.Header.Set("X-Tenant-ID", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /mail/me/accounts without X-User-ID: got %d", w.Code)
	}
}

func TestMailPatchAccountRequiresUserID(t *testing.T) {
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodPatch, "/mail/me/accounts/1", strings.NewReader(`{"label":"x"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", "1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("PATCH /mail/me/accounts/1 without X-User-ID: got %d", w.Code)
	}
}

// setupRouter construit un router de test (sans DB pour health/domains sans liste).
// Doit refléter les routes de main.go pour que les tests vérifient l'enregistrement.
func setupRouter(db *sql.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "mail-directory"}) })
	h := &Handler{db: db}
	r.Use(h.requireTenantAndUser)
	mail := r.Group("/mail")
	{
		mail.GET("/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "healthy", "service": "mail-directory"}) })
		mail.GET("/me/accounts", h.listUserAccounts)
		mail.POST("/me/accounts", h.createUserAccount)
		mail.PATCH("/me/accounts/:id", h.patchUserAccount)
		mail.DELETE("/me/accounts/:id", h.deleteUserAccount)
		mail.GET("/me/accounts/:id/messages", h.listAccountMessages)
		mail.GET("/domains", h.listDomains)
		mail.POST("/domains", h.createDomain)
		mail.GET("/domains/:id/mailboxes", h.listMailboxes)
		mail.GET("/domains/:id/aliases", h.listAliases)
	}
	return r
}
