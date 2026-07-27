// recovery_http.go — Handlers Gin pour /auth/2fa/recovery-codes/*.

package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/pavel/cloudity/auth-service/recovery"
)

func (a *AuthService) RegenerateRecoveryCodes(c *gin.Context) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	store, ok := a.userStore.(*postgresUserStore)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "recovery codes require postgres user store"})
		return
	}
	codes, err := recovery.GenerateAndStore(c.Request.Context(), store.db, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("regenerate: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"codes": codes,
		"count": len(codes),
		"warning": "Sauvegarde-les MAINTENANT — ils ne réapparaîtront plus. " +
			"Sans 2FA et sans ces codes, tu seras locké dehors si tu perds ton authenticator.",
	})
}

func (a *AuthService) CountRecoveryCodes(c *gin.Context) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	store, ok := a.userStore.(*postgresUserStore)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "recovery codes require postgres user store"})
		return
	}
	n, err := recovery.CountActive(c.Request.Context(), store.db, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	var is2FA bool
	if err := store.db.QueryRowContext(c.Request.Context(),
		`SELECT COALESCE(is_2fa_enabled, false) FROM users WHERE id::text = $1`, claims.UserID,
	).Scan(&is2FA); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"active": n, "is_2fa_enabled": is2FA})
}
