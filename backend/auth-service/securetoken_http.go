// securetoken_http.go — Handlers Gin pour `/auth/security-paths*`.

package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type SecurePathsResponse struct {
	Paths     map[string]SecurePathEntry `json:"paths"`
	IssuedAt  string                     `json:"issued_at"`
	WindowSec int64                      `json:"window_seconds"`
}

type SecurePathEntry struct {
	Path      string `json:"path"`
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
	RotatesAt string `json:"rotates_at"`
}

func (a *AuthService) SecurePaths(c *gin.Context) {
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
	uid, err := strconv.ParseInt(claims.UserID, 10, 64)
	if err != nil || uid <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
		return
	}
	now := time.Now().UTC()
	out := SecurePathsResponse{
		Paths:     make(map[string]SecurePathEntry, len(urlTokenPurposes)),
		IssuedAt:  now.Format(time.RFC3339),
		WindowSec: int64(urlTokenWindow.Seconds()),
	}
	rotatesAt := time.Unix(0, (urlTokenEpoch(now)+1)*int64(urlTokenWindow)).UTC()
	expiresAt := time.Unix(0, (urlTokenEpoch(now)+2)*int64(urlTokenWindow)).UTC()
	for purpose := range urlTokenPurposes {
		token, err := IssueUserPathToken(uid, purpose)
		if err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"error": "URL_TOKEN_SECRET indisponible — repli sur chemins canoniques",
			})
			return
		}
		out.Paths[purpose] = SecurePathEntry{
			Path:      pathForPurpose(purpose, token),
			Token:     token,
			ExpiresAt: expiresAt.Format(time.RFC3339),
			RotatesAt: rotatesAt.Format(time.RFC3339),
		}
	}
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("Referrer-Policy", "no-referrer")
	c.JSON(http.StatusOK, out)
}

func pathForPurpose(purpose, token string) string {
	switch purpose {
	case "settings_security":
		return "/app/settings/sec/" + token
	default:
		return "/app/settings"
	}
}

type ValidateSecurePathRequest struct {
	Token   string `json:"token"`
	Purpose string `json:"purpose"`
}

func (a *AuthService) ValidateSecurePath(c *gin.Context) {
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
	uid, err := strconv.ParseInt(claims.UserID, 10, 64)
	if err != nil || uid <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid user id"})
		return
	}
	var body ValidateSecurePathRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token & purpose required"})
		return
	}
	if err := VerifyUserPathToken(body.Token, uid, body.Purpose, time.Now()); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "expired or invalid"})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
