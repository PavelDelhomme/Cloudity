// identity_link.go — SSO opt-in : lien Hubera ID user ↔ user app satellite.
// Activé uniquement si HUBERA_SSO_ENABLED=1 (défaut : routes répondent 404).
// Supporte toutes les apps de l'écosystème Hubera.
package main

import (
	"database/sql"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// validHuberaApps liste toutes les apps supportées par Hubera ID SSO.
// Format : app_id → display name (pour les UI).
var validHuberaApps = map[string]string{
	"fuel":        "Hubera Fuel",
	"gasoil":      "Hubera Fuel", // alias legacy
	"music":       "Hubera Music",
	"ytmusic":     "Hubera Music", // alias legacy
	"jobs":        "Hubera Jobs",
	"jobbingtrack": "Hubera Jobs", // alias legacy
	"calendar":    "Hubera Calendar",
	"contacts":    "Hubera Contacts",
	"drive":       "Hubera Drive",
	"mail":        "Hubera Mail",
	"notes":       "Hubera Notes",
	"office":      "Hubera Office",
	"pass":        "Hubera Pass",
	"photos":      "Hubera Photos",
	"press":       "Hubera Press",
}

// normalizeAppID convertit les alias legacy vers les nouveaux noms d'app.
func normalizeAppID(appID string) string {
	appID = strings.ToLower(strings.TrimSpace(appID))
	switch appID {
	case "gasoil":
		return "fuel"
	case "ytmusic":
		return "music"
	case "jobbingtrack":
		return "jobs"
	default:
		return appID
	}
}

func isValidHuberaApp(appID string) bool {
	_, ok := validHuberaApps[normalizeAppID(appID)]
	return ok
}

func huberaSSOEnabled() bool {
	for _, key := range []string{"HUBERA_SSO_ENABLED", "CLOUDITY_SSO_ENABLED"} {
		v := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
		if v == "1" || v == "true" || v == "yes" || v == "on" {
			return true
		}
	}
	return false
}

func normalizeIdentityEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func registerIdentityLinkRoutes(r *gin.Engine, auth *AuthService, db *sql.DB) {
	r.POST("/auth/identity/link", func(c *gin.Context) { auth.IdentityLink(c, db) })
	r.GET("/auth/identity/links", func(c *gin.Context) { auth.IdentityListLinks(c, db) })
	r.POST("/auth/identity/detect", func(c *gin.Context) { auth.IdentityDetect(c, db) })
	r.POST("/auth/identity/quick-login", func(c *gin.Context) { auth.IdentityQuickLogin(c, db) })
	r.GET("/auth/identity/apps", auth.IdentityListApps)
}

// IdentityListApps GET /auth/identity/apps
// Retourne la liste des apps supportées par Hubera ID.
func (a *AuthService) IdentityListApps(c *gin.Context) {
	apps := make([]gin.H, 0, len(validHuberaApps))
	seen := make(map[string]bool)
	for appID, displayName := range validHuberaApps {
		normalized := normalizeAppID(appID)
		if seen[normalized] {
			continue
		}
		seen[normalized] = true
		apps = append(apps, gin.H{
			"app_id":       normalized,
			"display_name": displayName,
		})
	}
	c.JSON(http.StatusOK, gin.H{"apps": apps})
}

// IdentityLink POST /auth/identity/link
// Body: { "app_id": "<app>", "external_user_id": "...", "email": "..." }
// Header: Authorization: Bearer <access_token Hubera ID>
func (a *AuthService) IdentityLink(c *gin.Context, db *sql.DB) {
	if !huberaSSOEnabled() {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSO désactivé (HUBERA_SSO_ENABLED)"})
		return
	}
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
	appID := normalizeAppID(req.AppID)
	if !isValidHuberaApp(appID) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "app_id invalide",
			"valid_apps": getValidAppIDs(),
		})
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

	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "db indisponible"})
		return
	}
	var cloudityUID int
	err = db.QueryRow(
		`SELECT id FROM users WHERE id::text = $1 AND is_active = true LIMIT 1`,
		claims.UserID,
	).Scan(&cloudityUID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "utilisateur Hubera ID introuvable"})
		return
	}

	_, err = db.Exec(`
		INSERT INTO identity_app_links (cloudity_user_id, app_id, external_user_id, email_normalized)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (cloudity_user_id, app_id) DO UPDATE
		  SET external_user_id = EXCLUDED.external_user_id,
		      email_normalized = EXCLUDED.email_normalized,
		      linked_at = now()
	`, cloudityUID, appID, extID, email)
	if err != nil {
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
		"linked":           true,
		"hubera_user_id":   cloudityUID,
		"app_id":           appID,
		"external_user_id": extID,
		"email_normalized": email,
	})
}

func getValidAppIDs() []string {
	seen := make(map[string]bool)
	result := make([]string, 0)
	for appID := range validHuberaApps {
		normalized := normalizeAppID(appID)
		if !seen[normalized] {
			seen[normalized] = true
			result = append(result, normalized)
		}
	}
	return result
}

// IdentityListLinks GET /auth/identity/links
// Retourne les liens d'identité pour l'utilisateur authentifié.
func (a *AuthService) IdentityListLinks(c *gin.Context, db *sql.DB) {
	if !huberaSSOEnabled() {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSO désactivé"})
		return
	}
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

	rows, err := db.Query(`
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

// IdentityDetect POST /auth/identity/detect
// Détecte si un device_id a une session Hubera ID active.
// Body: { "device_id": "..." }
// Retourne l'email associé si trouvé, pour afficher "Continuer avec {email}".
func (a *AuthService) IdentityDetect(c *gin.Context, db *sql.DB) {
	if !huberaSSOEnabled() {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSO désactivé"})
		return
	}

	var req struct {
		DeviceID string `json:"device_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	deviceID := strings.TrimSpace(req.DeviceID)
	if deviceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "device_id requis"})
		return
	}

	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "db indisponible"})
		return
	}

	var email string
	var userID int
	var lastSeen time.Time
	err := db.QueryRow(`
		SELECT u.id, u.email, COALESCE(ds.last_seen, ds.last_seen_at, ds.created_at) as last_activity
		FROM device_sessions ds
		JOIN users u ON u.id = ds.user_id
		WHERE ds.device_id = $1 
		  AND COALESCE(ds.is_active, true) = true 
		  AND u.is_active = true
		ORDER BY COALESCE(ds.last_seen, ds.last_seen_at) DESC NULLS LAST
		LIMIT 1
	`, deviceID).Scan(&userID, &email, &lastSeen)

	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusOK, gin.H{
				"found":  false,
				"reason": "no_active_session",
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"found":  false,
			"reason": "lookup_error",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"found":           true,
		"email":           email,
		"hubera_user_id":  userID,
		"last_seen":       lastSeen.Format(time.RFC3339),
		"can_quick_login": true,
	})
}

// IdentityQuickLogin POST /auth/identity/quick-login
// Connexion rapide cross-app via device_id.
// Body: { "device_id": "...", "target_app": "..." }
// Retourne un access_token + refresh_token Hubera ID si le device a une session active.
func (a *AuthService) IdentityQuickLogin(c *gin.Context, db *sql.DB) {
	if !huberaSSOEnabled() {
		c.JSON(http.StatusNotFound, gin.H{"error": "SSO désactivé"})
		return
	}

	var req struct {
		DeviceID  string `json:"device_id" binding:"required"`
		TargetApp string `json:"target_app" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	deviceID := strings.TrimSpace(req.DeviceID)
	targetApp := normalizeAppID(req.TargetApp)

	if !isValidHuberaApp(targetApp) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":      "target_app invalide",
			"valid_apps": getValidAppIDs(),
		})
		return
	}

	if db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "db indisponible"})
		return
	}

	var userID string
	var tenantID string
	var email string
	var role string
	err := db.QueryRow(`
		SELECT u.id::text, COALESCE(u.tenant_id::text, '1'), u.email, COALESCE(u.role, 'user')
		FROM device_sessions ds
		JOIN users u ON u.id = ds.user_id
		WHERE ds.device_id = $1 
		  AND COALESCE(ds.is_active, true) = true 
		  AND u.is_active = true
		ORDER BY COALESCE(ds.last_seen, ds.last_seen_at) DESC NULLS LAST
		LIMIT 1
	`, deviceID).Scan(&userID, &tenantID, &email, &role)

	if err != nil {
		if err == sql.ErrNoRows {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error":  "session_not_found",
				"detail": "Aucune session active pour ce device",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "lookup_error"})
		return
	}

	_, err = db.Exec(`
		UPDATE device_sessions 
		SET last_seen = now(), last_seen_at = now(), last_app = $2
		WHERE device_id = $1 AND COALESCE(is_active, true) = true
	`, deviceID, targetApp)
	if err != nil {
		// Non bloquant, on continue
	}

	ctx := c.Request.Context()
	accessToken, refreshToken, err := a.issueTokens(ctx, userID, tenantID, email, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token_generation_failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user_id":       userID,
		"tenant_id":     tenantID,
		"email":         email,
		"expires_in":    int(accessTokenDuration.Seconds()),
		"quick_login":   true,
		"source_app":    "hubera-id",
		"target_app":    targetApp,
	})
}
