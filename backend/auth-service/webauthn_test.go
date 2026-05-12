package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func TestLoadWebAuthnConfigDefaults(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "")
	t.Setenv("WEBAUTHN_RP_NAME", "")
	t.Setenv("WEBAUTHN_ORIGINS", "")
	cfg := loadWebAuthnConfig()
	if cfg.RPID != "localhost" {
		t.Errorf("RPID default: %q", cfg.RPID)
	}
	if cfg.RPDisplayName != "Cloudity Admin" {
		t.Errorf("RPDisplayName default: %q", cfg.RPDisplayName)
	}
	if len(cfg.Origins) != 2 {
		t.Errorf("Origins default count: %d", len(cfg.Origins))
	}
}

func TestLoadWebAuthnConfigEnv(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "cloudity.local")
	t.Setenv("WEBAUTHN_RP_NAME", "Cloudity")
	t.Setenv("WEBAUTHN_ORIGINS", "https://app.cloudity.local, https://admin.cloudity.local")
	cfg := loadWebAuthnConfig()
	if cfg.RPID != "cloudity.local" {
		t.Errorf("RPID: %q", cfg.RPID)
	}
	if len(cfg.Origins) != 2 || cfg.Origins[0] != "https://app.cloudity.local" {
		t.Errorf("Origins: %+v", cfg.Origins)
	}
}

// TestRequireAdminUserAcceptsValidEdDSAToken vérifie que le gate accepte un
// JWT EdDSA (signé par la clé Ed25519 du service) et extrait l'user_id.
func TestRequireAdminUserAcceptsValidEdDSAToken(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("ed25519 keygen: %v", err)
	}
	authSvc := &AuthService{edPublicKey: pub, edPrivateKey: priv}
	svc := &WebAuthnService{authSvc: authSvc}

	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		UserID: "42",
		Role:   "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	tok.Header["kid"] = "ed25519-1"
	signed, err := tok.SignedString(priv)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("POST", "/x", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req

	uid, err := svc.requireAdminUser(c)
	if err != nil {
		t.Fatalf("requireAdminUser: %v", err)
	}
	if uid != 42 {
		t.Errorf("uid = %d", uid)
	}
}

func TestRequireAdminUserRejectsNonAdmin(t *testing.T) {
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	authSvc := &AuthService{edPublicKey: pub, edPrivateKey: priv}
	svc := &WebAuthnService{authSvc: authSvc}

	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, &Claims{
		UserID: "42",
		Role:   "user",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	signed, _ := tok.SignedString(priv)

	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("POST", "/x", nil)
	req.Header.Set("Authorization", "Bearer "+signed)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req

	if _, err := svc.requireAdminUser(c); err == nil || !strings.Contains(err.Error(), "admin") {
		t.Errorf("expected admin role error, got %v", err)
	}
}

func TestRequireAdminUserRejectsMissingBearer(t *testing.T) {
	svc := &WebAuthnService{authSvc: &AuthService{}}
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("POST", "/x", nil)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req
	if _, err := svc.requireAdminUser(c); err == nil {
		t.Error("expected error for missing bearer")
	}
}

// TestNewWebAuthnServiceInvalidConfig vérifie qu'une RP ID vide désactive
// le service au lieu de planter (no panic au boot).
func TestNewWebAuthnServiceInvalidConfig(t *testing.T) {
	cfg := WebAuthnConfig{RPDisplayName: "x"} // pas de RPID → invalid
	if svc := NewWebAuthnService(cfg, nil, nil, nil); svc != nil {
		t.Error("NewWebAuthnService should return nil for invalid config")
	}
}
