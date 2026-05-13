// routes.go — Enregistrement des routes HTTP publiques de l'auth-service.

package main

import (
	"database/sql"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

func registerAuthHTTPRoutes(r *gin.Engine, auth *AuthService, db *sql.DB, rdb *redis.Client) {
	r.POST("/auth/register", auth.Register)
	r.POST("/auth/login", auth.Login)
	r.POST("/auth/refresh", auth.RefreshToken)
	r.POST("/auth/2fa/enable", auth.Enable2FA)
	r.POST("/auth/2fa/verify", auth.Verify2FA)
	r.POST("/auth/2fa/recovery-codes/regenerate", auth.RegenerateRecoveryCodes)
	r.GET("/auth/2fa/recovery-codes/count", auth.CountRecoveryCodes)
	r.GET("/auth/security-paths", auth.SecurePaths)
	r.POST("/auth/security-paths/validate", auth.ValidateSecurePath)
	r.GET("/auth/validate", auth.ValidateToken)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "healthy"}) })

	NewWebAuthnService(loadWebAuthnConfig(), db, rdb, auth).RegisterRoutes(r)
}
