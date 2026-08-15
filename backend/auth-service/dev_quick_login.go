package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// Connexion rapide locale (UI web + apps Flutter) — jamais en production.
// CLOUDITY_ALLOW_DEV_QUICK_LOGIN=1 + GO_ENV/NODE_ENV ≠ production.

func devQuickLoginEnvOK() bool {
	if strings.TrimSpace(os.Getenv("CLOUDITY_ALLOW_DEV_QUICK_LOGIN")) != "1" {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("GO_ENV")), "production") {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("NODE_ENV")), "production") {
		return false
	}
	return true
}

func registerDevQuickLoginRoutesIfEnabled(r *gin.Engine, auth *AuthService) {
	if !devQuickLoginEnvOK() {
		return
	}
	r.GET("/auth/dev/personas", auth.DevQuickLoginPersonas)
	r.POST("/auth/dev/quick-login", auth.DevQuickLogin)
	log.Print("auth-service: routes DEV quick-login enregistrées (/auth/dev/*) — usage local uniquement")
}

type devPersona struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

func devQuickLoginAdminEmail() string {
	for _, k := range []string{"DEV_QUICK_LOGIN_ADMIN_EMAIL", "SEED_ADMIN_EMAIL"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return "admin@cloudity.local"
}

func devQuickLoginUserEmail() string {
	if v := strings.TrimSpace(os.Getenv("DEV_QUICK_LOGIN_USER_EMAIL")); v != "" {
		return v
	}
	return "user@cloudity.local"
}

func (a *AuthService) listDevPersonas() []devPersona {
	return []devPersona{
		{ID: "admin", Label: "Admin", Email: devQuickLoginAdminEmail(), Role: "admin"},
		{ID: "user", Label: "Utilisateur", Email: devQuickLoginUserEmail(), Role: "user"},
	}
}

func (a *AuthService) DevQuickLoginPersonas(c *gin.Context) {
	if !devQuickLoginEnvOK() {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"enabled":  true,
		"personas": a.listDevPersonas(),
	})
}

// DevQuickLogin émet access+refresh sans mot de passe pour une persona connue.
func (a *AuthService) DevQuickLogin(c *gin.Context) {
	if !devQuickLoginEnvOK() {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		Persona  string `json:"persona"`
		Email    string `json:"email"`
		TenantID string `json:"tenant_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	tenantID := strings.TrimSpace(req.TenantID)
	if tenantID == "" {
		tenantID = "1"
	}

	email := strings.TrimSpace(strings.ToLower(req.Email))
	persona := strings.TrimSpace(strings.ToLower(req.Persona))
	if email == "" {
		switch persona {
		case "admin":
			email = strings.ToLower(devQuickLoginAdminEmail())
		case "user":
			email = strings.ToLower(devQuickLoginUserEmail())
		default:
			c.JSON(http.StatusBadRequest, gin.H{"error": "persona must be admin or user (or provide email)"})
			return
		}
	}

	allowed := false
	for _, p := range a.listDevPersonas() {
		if strings.EqualFold(p.Email, email) {
			allowed = true
			break
		}
	}
	if !allowed {
		c.JSON(http.StatusForbidden, gin.H{"error": "email not in allowed dev personas"})
		return
	}

	userID, _, _, role, is2FAEnabled, err := a.userStore.GetUserByEmailTenant(email, tenantID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "account missing — run make seed-dev-users (or seed-admin)",
		})
		return
	}
	if is2FAEnabled {
		c.JSON(http.StatusForbidden, gin.H{"error": "2fa enabled: use normal login for this account"})
		return
	}
	if strings.TrimSpace(role) == "" {
		role = "user"
	}

	access, refresh, err := a.issueTokens(c.Request.Context(), userID, tenantID, email, role)
	if err != nil {
		log.Printf("auth-service: dev quick-login issueTokens: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token issuance failed"})
		return
	}
	log.Printf("auth-service: dev quick-login ok persona=%s email=%s role=%s", persona, email, role)
	c.JSON(http.StatusOK, gin.H{
		"access_token":  access,
		"refresh_token": refresh,
		"user_id":       userID,
		"email":         email,
		"role":          role,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}
