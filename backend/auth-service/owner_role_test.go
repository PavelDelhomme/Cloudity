package main

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestEffectiveRole_ownerAllowlistNotLab(t *testing.T) {
	t.Setenv("SEED_ADMIN_EMAIL", "owner@example.com")
	t.Setenv("ADMIN_EMAILS", "")
	t.Setenv("DEV_QUICK_LOGIN_ADMIN_EMAIL", "")

	if got := effectiveRole("Owner@Example.com", "user"); got != "admin" {
		t.Fatalf("owner role=%q, want admin", got)
	}
	if got := effectiveRole("qa.lab@example.com", "user"); got != "user" {
		t.Fatalf("lab role=%q, want user", got)
	}
	if got := effectiveRole("qa.lab@example.com", ""); got != "user" {
		t.Fatalf("empty db role=%q, want user", got)
	}
}

func TestParseHMACAccess_keepsIdentityWithoutRole(t *testing.T) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, &Claims{
		UserID:   "user-1",
		TenantID: "1",
		Email:    "owner@example.com",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	})
	signed, err := token.SignedString([]byte("test-secret"))
	if err != nil {
		t.Fatal(err)
	}
	claims, err := parseHMACAccess(signed, "test-secret")
	if err != nil {
		t.Fatal(err)
	}
	if claims.UserID != "user-1" || claims.Email != "owner@example.com" || claims.Role != "" {
		t.Fatalf("claims user=%q email=%q role=%q", claims.UserID, claims.Email, claims.Role)
	}
	if _, err := parseHMACAccess(signed, "other-secret"); err == nil {
		t.Fatal("wrong secret should fail")
	}
}

func TestEffectiveRole_noAllowlistKeepsDatabase(t *testing.T) {
	t.Setenv("SEED_ADMIN_EMAIL", "")
	t.Setenv("ADMIN_EMAILS", "")
	t.Setenv("DEV_QUICK_LOGIN_ADMIN_EMAIL", "")
	if got := effectiveRole("owner@example.com", "user"); got != "user" {
		t.Fatalf("role=%q, want user", got)
	}
}
