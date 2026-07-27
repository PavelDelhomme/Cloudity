package webauthn

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestLoadWebAuthnConfigDefaults(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "")
	t.Setenv("WEBAUTHN_RP_NAME", "")
	t.Setenv("WEBAUTHN_ORIGINS", "")
	cfg := LoadWebAuthnConfig()
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
	cfg := LoadWebAuthnConfig()
	if cfg.RPID != "cloudity.local" {
		t.Errorf("RPID: %q", cfg.RPID)
	}
	if len(cfg.Origins) != 2 || cfg.Origins[0] != "https://app.cloudity.local" {
		t.Errorf("Origins: %+v", cfg.Origins)
	}
}

type bridgeMock struct {
	verifyFn func(tokenStr string) (int64, string, error)
}

func (m bridgeMock) VerifyBearerToken(tokenStr string) (int64, string, error) {
	return m.verifyFn(tokenStr)
}

func (m bridgeMock) GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret, role string, is2FAEnabled bool, err error) {
	return "", "", "", "", false, errors.New("not implemented")
}

func (m bridgeMock) IssueTokens(ctx context.Context, userID, tenantID int64, email, role string) (access, refresh string, err error) {
	return "", "", errors.New("not implemented")
}

func TestRequireAuthUserUsesBridge(t *testing.T) {
	svc := &Service{
		bridge: bridgeMock{
			verifyFn: func(tokenStr string) (int64, string, error) {
				if tokenStr != "abc123" {
					t.Fatalf("tokenStr = %q", tokenStr)
				}
				return 42, "admin", nil
			},
		},
	}

	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("POST", "/x", nil)
	req.Header.Set("Authorization", "Bearer abc123")
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req

	uid, role, err := svc.requireAuthUser(c)
	if err != nil {
		t.Fatalf("requireAuthUser: %v", err)
	}
	if uid != 42 || role != "admin" {
		t.Errorf("uid=%d role=%q", uid, role)
	}
}

func TestRequireAuthUserRejectsMissingBearer(t *testing.T) {
	svc := &Service{bridge: bridgeMock{verifyFn: func(tokenStr string) (int64, string, error) {
		return 0, "", nil
	}}}
	gin.SetMode(gin.TestMode)
	req := httptest.NewRequest("POST", "/x", nil)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = req
	if _, _, err := svc.requireAuthUser(c); err == nil {
		t.Error("expected error for missing bearer")
	}
}

// userIDFromWebAuthnID est l'inverse exact de WebAuthnID() — vérifions un
// round-trip.
func TestUserIDWebAuthnIDRoundTrip(t *testing.T) {
	for _, want := range []int64{1, 42, 1234567890, 9_223_372_036_854_775_807} {
		u := &webauthnUser{id: want}
		got, err := userIDFromWebAuthnID(u.WebAuthnID())
		if err != nil {
			t.Fatalf("decode %d: %v", want, err)
		}
		if got != want {
			t.Errorf("round-trip %d → %d", want, got)
		}
	}
}

func TestUserIDFromInvalidHandle(t *testing.T) {
	if _, err := userIDFromWebAuthnID([]byte{1, 2, 3}); err == nil {
		t.Error("expected error for short handle")
	}
}

// TestNewWebAuthnServiceInvalidConfig vérifie qu'une RP ID vide désactive
// le service au lieu de planter (no panic au boot).
func TestNewWebAuthnServiceInvalidConfig(t *testing.T) {
	cfg := Config{RPDisplayName: "x"} // pas de RPID → invalid
	if svc := NewWebAuthnService(cfg, nil, nil, nil); svc != nil {
		t.Error("NewWebAuthnService should return nil for invalid config")
	}
}
