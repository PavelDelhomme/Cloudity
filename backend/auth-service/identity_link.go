// identity_link.go — SSO opt-in : lien Cloudity / Hubera ID ↔ user app satellite.
// Login local de chaque app reste le défaut. Ces routes ne fusionnent rien.
// CLOUDITY_SSO_ENABLED réserve un futur « remplacer le login local » (non implémenté).
package main

import (
	"database/sql"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

func clouditySSOEnabled() bool {
	v := strings.TrimSpace(strings.ToLower(os.Getenv("CLOUDITY_SSO_ENABLED")))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func normalizeIdentityEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func registerIdentityLinkRoutes(r *gin.Engine, auth *AuthService) {
	r.POST("/auth/identity/link", auth.IdentityLink)
	r.GET("/auth/identity/links", auth.IdentityListLinks)
	r.GET("/auth/identity/sso-status", auth.IdentitySsoStatus)
}

// IdentitySsoStatus GET /auth/identity/sso-status — public, sans token.
// link_opt_in : lier un compte satellite (email identique). force_replace_local_login : réservé.
func (a *AuthService) IdentitySsoStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"link_opt_in":                 true,
		"force_replace_local_login":   clouditySSOEnabled(),
		"idp":                         "cloudity",
		"hubera_id":                   "https://id.hubera.cloud",
	})
}

// IdentityLink POST /auth/identity/link
// Body: { "app_id": "ytmusic"|"gasoil"|"jobbingtrack", "external_user_id": "...", "email": "..." }
// Header: Authorization: Bearer <access_token Cloudity>
func (a *AuthService) IdentityLink(c *gin.Context) {
	// Opt-in public : Bearer Cloudity + email identique. Pas de fusion, pas de login forcé.
	const prefix = "Bearer "
	authz := c.GetHeader("Authorization")
	if !strings.HasPrefix(authz, prefix) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Bearer token requis"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimSpace(authz[len(prefix):]))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token invalide"})
		return
	}

	var req struct {
		AppID          string `json:"app_id" binding:"required"`
		ExternalUserID string `json:"external_user_id" binding:"required"`
		Email          string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	appID := strings.ToLower(strings.TrimSpace(req.AppID))
	switch appID {
	case "ytmusic", "gasoil", "jobbingtrack", "budget", "taskflow", "stream", "maps", "cloudity":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "app_id invalide"})
		return
	}
	email := normalizeIdentityEmail(req.Email)
	tokenEmail := normalizeIdentityEmail(claims.Email)
	if email == "" || tokenEmail == "" || email != tokenEmail {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "email doit correspondre au compte Cloudity (email vérifié)",
		})
		return
	}

	extID := strings.TrimSpace(req.ExternalUserID)
	if extID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "external_user_id requis"})
		return
	}

	// users.id est INTEGER en Postgres Cloudity ; claims.UserID est string.
	if a.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "db indisponible"})
		return
	}
	var cloudityUID int
	err = a.db.QueryRow(
		`SELECT id FROM users WHERE id::text = $1 AND is_active = true LIMIT 1`,
		claims.UserID,
	).Scan(&cloudityUID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur Cloudity introuvable"})
		return
	}

	_, err = a.db.Exec(`
		INSERT INTO identity_app_links (cloudity_user_id, app_id, external_user_id, email_normalized)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (cloudity_user_id, app_id) DO UPDATE
		  SET external_user_id = EXCLUDED.external_user_id,
		      email_normalized = EXCLUDED.email_normalized,
		      linked_at = now()
	`, cloudityUID, appID, extID, email)
	if err != nil {
		// Table absente → 503 avec hint migration
		if strings.Contains(err.Error(), "identity_app_links") {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "table identity_app_links absente — appliquer migration 50-identity-app-links.sql",
			})
			return
		}
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"linked":            true,
		"cloudity_user_id":  cloudityUID,
		"app_id":            appID,
		"external_user_id":  extID,
		"email_normalized":  email,
	})
}

// IdentityListLinks GET /auth/identity/links
func (a *AuthService) IdentityListLinks(c *gin.Context) {
	const prefix = "Bearer "
	authz := c.GetHeader("Authorization")
	if !strings.HasPrefix(authz, prefix) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Bearer token requis"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimSpace(authz[len(prefix):]))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "token invalide"})
		return
	}

	rows, err := a.db.Query(`
		SELECT app_id, external_user_id, email_normalized, linked_at::text
		FROM identity_app_links
		WHERE cloudity_user_id::text = $1 OR email_normalized = $2
		ORDER BY linked_at DESC
	`, claims.UserID, normalizeIdentityEmail(claims.Email))
	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{"links": []any{}})
			return
		}
		c.JSON(http.StatusOK, gin.H{"links": []any{}, "hint": "migration identity_app_links peut être absente"})
		return
	}
	defer rows.Close()

	type link struct {
		AppID          string `json:"app_id"`
		ExternalUserID string `json:"external_user_id"`
		Email          string `json:"email_normalized"`
		LinkedAt       string `json:"linked_at"`
	}
	out := []link{}
	for rows.Next() {
		var L link
		if err := rows.Scan(&L.AppID, &L.ExternalUserID, &L.Email, &L.LinkedAt); err != nil {
			continue
		}
		out = append(out, L)
	}
	c.JSON(http.StatusOK, gin.H{"links": out})
}
