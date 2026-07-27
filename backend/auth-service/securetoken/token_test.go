package securetoken_test

import (
	"os"
	"strings"
	"testing"
	"time"

	"github.com/pavel/cloudity/auth-service/securetoken"
)

func setEnv(t *testing.T, k, v string) string {
	t.Helper()
	prev := os.Getenv(k)
	if v == "" {
		_ = os.Unsetenv(k)
	} else if err := os.Setenv(k, v); err != nil {
		t.Fatalf("setenv %s: %v", k, err)
	}
	return prev
}

func withURLTokenSecret(t *testing.T, value string) {
	t.Helper()
	old := setEnv(t, "URL_TOKEN_SECRET", value)
	t.Cleanup(func() { setEnv(t, "URL_TOKEN_SECRET", old) })
}

func TestIssueAndVerifyUserPathToken_HappyPath(t *testing.T) {
	withURLTokenSecret(t, strings.Repeat("a", 32))
	tok, err := securetoken.IssueUserPathToken(42, "settings_security")
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if !strings.Contains(tok, ".") {
		t.Fatalf("token sans séparateur : %q", tok)
	}
	if err := securetoken.VerifyUserPathToken(tok, 42, "settings_security", time.Now()); err != nil {
		t.Fatalf("verify (now): %v", err)
	}
}

func TestVerifyUserPathToken_RejectsWrongUser(t *testing.T) {
	withURLTokenSecret(t, strings.Repeat("b", 32))
	tok, err := securetoken.IssueUserPathToken(42, "settings_security")
	if err != nil {
		t.Fatal(err)
	}
	if err := securetoken.VerifyUserPathToken(tok, 99, "settings_security", time.Now()); err == nil {
		t.Fatalf("doit rejeter token user 42 utilisé sous 99")
	}
}

func TestVerifyUserPathToken_RejectsWrongPurpose(t *testing.T) {
	withURLTokenSecret(t, strings.Repeat("c", 32))
	tok, err := securetoken.IssueUserPathToken(42, "settings_security")
	if err != nil {
		t.Fatal(err)
	}
	if err := securetoken.VerifyUserPathToken(tok, 42, "purpose_inconnu", time.Now()); err == nil {
		t.Fatalf("doit rejeter purpose inconnu")
	}
}

func TestVerifyUserPathToken_RejectsExpired(t *testing.T) {
	withURLTokenSecret(t, strings.Repeat("d", 32))
	tok, err := securetoken.IssueUserPathToken(42, "settings_security")
	if err != nil {
		t.Fatal(err)
	}
	future := time.Now().Add(90 * 24 * time.Hour)
	if err := securetoken.VerifyUserPathToken(tok, 42, "settings_security", future); err == nil {
		t.Fatalf("token périmé doit être rejeté")
	}
}

func TestVerifyUserPathToken_AcceptsPreviousEpoch(t *testing.T) {
	withURLTokenSecret(t, strings.Repeat("e", 32))
	tok, err := securetoken.IssueUserPathToken(42, "settings_security")
	if err != nil {
		t.Fatal(err)
	}
	near := time.Now().Add(25 * 24 * time.Hour)
	if err := securetoken.VerifyUserPathToken(tok, 42, "settings_security", near); err != nil {
		t.Fatalf("verify (J+25): %v", err)
	}
	sliding := time.Now().Add(35 * 24 * time.Hour)
	if err := securetoken.VerifyUserPathToken(tok, 42, "settings_security", sliding); err != nil {
		t.Fatalf("verify (J+35, sliding): %v", err)
	}
}

func TestVerifyUserPathToken_RejectsTampered(t *testing.T) {
	withURLTokenSecret(t, strings.Repeat("f", 32))
	tok, err := securetoken.IssueUserPathToken(42, "settings_security")
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.SplitN(tok, ".", 2)
	if len(parts) != 2 {
		t.Fatalf("format inattendu : %q", tok)
	}
	hmacPart := []byte(parts[1])
	if hmacPart[0] == 'A' {
		hmacPart[0] = 'B'
	} else {
		hmacPart[0] = 'A'
	}
	tampered := parts[0] + "." + string(hmacPart)
	if err := securetoken.VerifyUserPathToken(tampered, 42, "settings_security", time.Now()); err == nil {
		t.Fatalf("doit rejeter HMAC modifié")
	}
}

func TestVerifyUserPathToken_RejectsMalformed(t *testing.T) {
	withURLTokenSecret(t, strings.Repeat("g", 32))
	cases := []string{"", "abc", "123", "123.", ".AAA", "foo.bar"}
	for _, tok := range cases {
		if err := securetoken.VerifyUserPathToken(tok, 42, "settings_security", time.Now()); err == nil {
			t.Errorf("token malformé accepté : %q", tok)
		}
	}
}

func TestUrlTokenSecret_FallbackJWTSecret(t *testing.T) {
	withURLTokenSecret(t, "")
	prevJwt := setEnv(t, "JWT_SECRET", "demo-jwt-secret-change-in-prod-please-32+oct")
	t.Cleanup(func() { setEnv(t, "JWT_SECRET", prevJwt) })

	if _, err := securetoken.IssueUserPathToken(1, "settings_security"); err != nil {
		t.Fatalf("fallback JWT_SECRET doit suffire : %v", err)
	}
}

func TestUrlTokenSecret_FailClosedWithoutAnySecret(t *testing.T) {
	withURLTokenSecret(t, "")
	prevJwt := setEnv(t, "JWT_SECRET", "")
	t.Cleanup(func() { setEnv(t, "JWT_SECRET", prevJwt) })

	if _, err := securetoken.IssueUserPathToken(1, "settings_security"); err == nil {
		t.Fatalf("doit échouer sans aucun secret")
	}
}

func TestPathForPurpose(t *testing.T) {
	if got := securetoken.PathForPurpose("settings_security", "abc"); got != "/app/settings/sec/abc" {
		t.Fatalf("settings_security mismatch : %q", got)
	}
	if got := securetoken.PathForPurpose("inconnu", "xyz"); got != "/app/settings" {
		t.Fatalf("inconnu doit retomber sur /app/settings : %q", got)
	}
}
