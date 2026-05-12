package main

// Tests dédiés à la sélection de clé JWT (selectKeyForToken).
// Couvre la transition Phase B → Phase C (cf. CRYPTO-NORME.md § 5.2) :
//   - tokens nouveaux (kid="ed25519-1", alg=EdDSA) → clé Ed25519
//   - tokens legacy (kid="rs256-1" ou absent, alg=RS256) → clé RSA
//   - tokens malicieux (kid/alg mismatch, kid inconnu) → erreur
//
// Ne touche PAS au routeur HTTP : ces tests manipulent directement la
// keyfunc et les variables globales `publicKeyVal` / `publicEd25519Val`
// pour rester rapides et isolés.

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// withTestKeys injecte une paire RSA et une paire Ed25519 dans les
// variables globales de gateway, et restaure l'état précédent en fin
// de test pour ne pas polluer les autres tests.
func withTestKeys(t *testing.T) (*rsa.PrivateKey, ed25519.PrivateKey) {
	t.Helper()
	rsaPriv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("rsa generate: %v", err)
	}
	edPub, edPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("ed25519 generate: %v", err)
	}

	publicKeyMu.Lock()
	prevRSA := publicKeyVal
	prevEd := publicEd25519Val
	publicKeyVal = &rsaPriv.PublicKey
	publicEd25519Val = edPub
	publicKeyMu.Unlock()

	t.Cleanup(func() {
		publicKeyMu.Lock()
		publicKeyVal = prevRSA
		publicEd25519Val = prevEd
		publicKeyMu.Unlock()
	})
	return rsaPriv, edPriv
}

func makeClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"user_id":   "1",
		"tenant_id": "1",
		"email":     "x@test.com",
		"exp":       time.Now().Add(time.Minute).Unix(),
		"iat":       time.Now().Unix(),
	}
}

func TestSelectKeyForToken_EdDSAOK(t *testing.T) {
	_, edPriv := withTestKeys(t)
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, makeClaims())
	tok.Header["kid"] = kidEd25519
	signed, err := tok.SignedString(edPriv)
	if err != nil {
		t.Fatalf("sign EdDSA: %v", err)
	}
	parsed, err := jwt.Parse(signed, selectKeyForToken)
	if err != nil || !parsed.Valid {
		t.Fatalf("Parse EdDSA: valid=%v err=%v", parsed != nil && parsed.Valid, err)
	}
}

func TestSelectKeyForToken_LegacyRS256OK(t *testing.T) {
	rsaPriv, _ := withTestKeys(t)
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, makeClaims())
	tok.Header["kid"] = kidRSA
	signed, err := tok.SignedString(rsaPriv)
	if err != nil {
		t.Fatalf("sign RS256: %v", err)
	}
	parsed, err := jwt.Parse(signed, selectKeyForToken)
	if err != nil || !parsed.Valid {
		t.Fatalf("Parse RS256 with kid: valid=%v err=%v", parsed != nil && parsed.Valid, err)
	}
}

func TestSelectKeyForToken_LegacyRS256_NoKidOK(t *testing.T) {
	rsaPriv, _ := withTestKeys(t)
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, makeClaims())
	// Pas de kid : route fallback RSA pour les très anciens tokens.
	signed, err := tok.SignedString(rsaPriv)
	if err != nil {
		t.Fatalf("sign RS256: %v", err)
	}
	parsed, err := jwt.Parse(signed, selectKeyForToken)
	if err != nil || !parsed.Valid {
		t.Fatalf("Parse RS256 without kid: valid=%v err=%v", parsed != nil && parsed.Valid, err)
	}
}

func TestSelectKeyForToken_AlgMismatchRejected(t *testing.T) {
	_, edPriv := withTestKeys(t)
	// kid annonce RSA mais signature en EdDSA → refus (alg confusion).
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, makeClaims())
	tok.Header["kid"] = kidRSA
	signed, err := tok.SignedString(edPriv)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if _, err := jwt.Parse(signed, selectKeyForToken); err == nil {
		t.Fatal("expected error for kid=rs256-1 with EdDSA signature")
	}
}

func TestSelectKeyForToken_UnknownKidRejected(t *testing.T) {
	_, edPriv := withTestKeys(t)
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, makeClaims())
	tok.Header["kid"] = "intruder-key-1"
	signed, _ := tok.SignedString(edPriv)
	_, err := jwt.Parse(signed, selectKeyForToken)
	if err == nil {
		t.Fatal("expected error for unknown kid")
	}
	if !strings.Contains(err.Error(), "unknown kid") {
		t.Errorf("expected 'unknown kid' in error, got: %v", err)
	}
}
