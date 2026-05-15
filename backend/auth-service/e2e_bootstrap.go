package main

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// e2eBootstrapKV stocke les OTP jetables (usage unique via GetDel) pour le flux
// TEST-AUTH-01. Implémentations : Redis (prod/dev) ou mémoire (tests).
type e2eBootstrapKV interface {
	SetEX(ctx context.Context, key, val string, ttl time.Duration) error
	// GetDel renvoie redis.Nil si la clé est absente (déjà consommée ou expirée).
	GetDel(ctx context.Context, key string) (string, error)
}

type redisE2EBootstrapKV struct{ rdb *redis.Client }

func (k *redisE2EBootstrapKV) SetEX(ctx context.Context, key, val string, ttl time.Duration) error {
	return k.rdb.Set(ctx, key, val, ttl).Err()
}

func (k *redisE2EBootstrapKV) GetDel(ctx context.Context, key string) (string, error) {
	return k.rdb.GetDel(ctx, key).Result()
}

const e2eBootstrapKeyPrefix = "e2e_bootstrap_v1:"

func e2eBootstrapSecretMinLen() int { return 32 }

func e2eBootstrapOTPTTL() time.Duration {
	v := strings.TrimSpace(os.Getenv("E2E_BOOTSTRAP_OTP_TTL_SECONDS"))
	if v == "" {
		return 2 * time.Minute
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 10 || n > 600 {
		log.Printf("auth-service: E2E_BOOTSTRAP_OTP_TTL_SECONDS=%q invalide (10–600), défaut 120s", v)
		return 2 * time.Minute
	}
	return time.Duration(n) * time.Second
}

// e2eBootstrapEnvOK : garde-fous stricts — jamais en GO_ENV/NODE_ENV production.
func e2eBootstrapEnvOK() bool {
	if strings.TrimSpace(os.Getenv("CLOUDITY_ALLOW_E2E_BOOTSTRAP")) != "1" {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("GO_ENV")), "production") {
		return false
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("NODE_ENV")), "production") {
		return false
	}
	sec := strings.TrimSpace(os.Getenv("E2E_BOOTSTRAP_SECRET"))
	if len(sec) < e2eBootstrapSecretMinLen() {
		return false
	}
	return true
}

func expectedE2EBootstrapSecret() string {
	return strings.TrimSpace(os.Getenv("E2E_BOOTSTRAP_SECRET"))
}

func constantTimeBootstrapSecretOK(provided string) bool {
	exp := expectedE2EBootstrapSecret()
	got := strings.TrimSpace(provided)
	if len(exp) < e2eBootstrapSecretMinLen() || len(got) != len(exp) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(exp), []byte(got)) == 1
}

func e2eOTPStorageKey(oneTimeToken string) string {
	h := sha256.Sum256([]byte(strings.TrimSpace(oneTimeToken)))
	return e2eBootstrapKeyPrefix + hex.EncodeToString(h[:])
}

func registerE2EBootstrapRoutesIfEnabled(r *gin.Engine, auth *AuthService) {
	if !e2eBootstrapEnvOK() {
		return
	}
	if auth.e2eKV == nil {
		log.Print("auth-service: CLOUDITY_ALLOW_E2E_BOOTSTRAP=1 mais e2eKV nil — routes bootstrap ignorées")
		return
	}
	r.POST("/auth/e2e/bootstrap-mint", auth.E2EBootstrapMint)
	r.POST("/auth/e2e/bootstrap-exchange", auth.E2EBootstrapExchange)
	log.Print("auth-service: routes E2E bootstrap enregistrées (mint + exchange) — usage CI/dev uniquement")
}

// E2EBootstrapMint : vérifie E2E_BOOTSTRAP_SECRET, crée un jeton à usage unique en Redis.
func (a *AuthService) E2EBootstrapMint(c *gin.Context) {
	if !e2eBootstrapEnvOK() || a.e2eKV == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		BootstrapSecret string `json:"bootstrap_secret" binding:"required"`
		Email           string `json:"email" binding:"required,email"`
		TenantID        string `json:"tenant_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	start := time.Now()
	if !constantTimeBootstrapSecretOK(req.BootstrapSecret) {
		padLoginResponse(start)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid request"})
		return
	}

	userID, _, _, role, is2FAEnabled, err := a.userStore.GetUserByEmailTenant(req.Email, req.TenantID)
	if err != nil {
		padLoginResponse(start)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid request"})
		return
	}
	if is2FAEnabled {
		padLoginResponse(start)
		c.JSON(http.StatusForbidden, gin.H{"error": "2fa enabled: bootstrap mint disabled for this account"})
		return
	}

	otp := generateRandomToken()
	payload := userID + "|" + req.TenantID + "|" + req.Email + "|" + role
	ctx := c.Request.Context()
	ttl := e2eBootstrapOTPTTL()
	if err := a.e2eKV.SetEX(ctx, e2eOTPStorageKey(otp), payload, ttl); err != nil {
		log.Printf("auth-service: e2e bootstrap mint redis: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bootstrap store unavailable"})
		return
	}

	padLoginResponse(start)
	log.Printf("auth-service: e2e bootstrap mint ok user_id=%s tenant=%s", userID, req.TenantID)
	c.JSON(http.StatusOK, gin.H{
		"one_time_token": otp,
		"expires_in":     int(ttl.Seconds()),
	})
}

// E2EBootstrapExchange : consomme une fois le jeton → paire access + refresh (comme login sans 2FA).
func (a *AuthService) E2EBootstrapExchange(c *gin.Context) {
	if !e2eBootstrapEnvOK() || a.e2eKV == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var req struct {
		OneTimeToken string `json:"one_time_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ctx := c.Request.Context()
	key := e2eOTPStorageKey(req.OneTimeToken)
	raw, err := a.e2eKV.GetDel(ctx, key)
	if err != nil {
		if errors.Is(err, redis.Nil) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired one_time_token"})
			return
		}
		log.Printf("auth-service: e2e bootstrap exchange redis: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "bootstrap store unavailable"})
		return
	}
	parts := strings.SplitN(raw, "|", 4)
	if len(parts) != 4 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired one_time_token"})
		return
	}
	userID, tenantID, email, role := parts[0], parts[1], parts[2], parts[3]
	if strings.TrimSpace(role) == "" {
		role = "user"
	}
	access, refresh, err := a.issueTokens(ctx, userID, tenantID, email, role)
	if err != nil {
		log.Printf("auth-service: e2e bootstrap exchange issueTokens: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "token issuance failed"})
		return
	}
	log.Printf("auth-service: e2e bootstrap exchange ok user_id=%s", userID)
	c.JSON(http.StatusOK, gin.H{
		"access_token":  access,
		"refresh_token": refresh,
		"user_id":       userID,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}
