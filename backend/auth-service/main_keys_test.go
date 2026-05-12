package main

import (
	"crypto/ed25519"
	"os"
	"path/filepath"
	"testing"
)

// TestKeyDirOverrideWritesAndReloadsEd25519 vérifie que :
//  1. Sans variable, keyDir() = "." (rétrocompat dev).
//  2. Avec AUTH_KEYS_DIR=<tmp>, loadEd25519Keys écrit la paire dans ce
//     répertoire et un second appel la rechargera depuis le disque (pas
//     une nouvelle paire).
//
// Important pour la prod : ce comportement permet de monter un volume
// nommé `cloudity_auth_keys` à AUTH_KEYS_DIR pour que les JWT existants
// restent valides après un redéploiement (sinon tous les tokens cassent
// à chaque rebuild).
func TestKeyDirOverrideWritesAndReloadsEd25519(t *testing.T) {
	t.Run("default keyDir is .", func(t *testing.T) {
		t.Setenv("AUTH_KEYS_DIR", "")
		if got := keyDir(); got != "." {
			t.Fatalf("keyDir() default = %q, want %q", got, ".")
		}
	})

	tmp := t.TempDir()
	t.Setenv("AUTH_KEYS_DIR", tmp)

	if got := keyDir(); got != tmp {
		t.Fatalf("keyDir() with override = %q, want %q", got, tmp)
	}

	// 1er appel : génère et écrit.
	priv1, pub1 := loadEd25519Keys()
	if len(priv1) != ed25519.PrivateKeySize {
		t.Fatalf("priv1 size = %d, want %d", len(priv1), ed25519.PrivateKeySize)
	}
	if _, err := os.Stat(filepath.Join(tmp, "private_ed25519.pem")); err != nil {
		t.Fatalf("private_ed25519.pem missing in %s: %v", tmp, err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "public_ed25519.pem")); err != nil {
		t.Fatalf("public_ed25519.pem missing in %s: %v", tmp, err)
	}

	// 2e appel : doit recharger la même paire (sinon les JWT existants seraient invalidés).
	priv2, pub2 := loadEd25519Keys()
	if !pub1.Equal(pub2) {
		t.Fatalf("Ed25519 public key changed on reload (would invalidate every existing JWT)")
	}
	if !priv1.Equal(priv2) {
		t.Fatalf("Ed25519 private key changed on reload")
	}
}

// TestKeyDirOverrideWritesAndReloadsRSA — équivalent pour RS256 (clé legacy
// utilisée pour la rétrocompat refresh tokens existants pendant Phase B).
func TestKeyDirOverrideWritesAndReloadsRSA(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("AUTH_KEYS_DIR", tmp)

	priv1, pub1 := loadRSAKeys()
	if priv1 == nil || pub1 == nil {
		t.Fatal("loadRSAKeys returned nil keys")
	}
	if _, err := os.Stat(filepath.Join(tmp, "private.pem")); err != nil {
		t.Fatalf("private.pem missing in %s: %v", tmp, err)
	}
	if _, err := os.Stat(filepath.Join(tmp, "public.pem")); err != nil {
		t.Fatalf("public.pem missing in %s: %v", tmp, err)
	}

	priv2, pub2 := loadRSAKeys()
	if priv1.N.Cmp(priv2.N) != 0 || priv1.E != priv2.E {
		t.Fatalf("RSA private key changed on reload (would invalidate every existing legacy JWT)")
	}
	if pub1.N.Cmp(pub2.N) != 0 {
		t.Fatalf("RSA public key changed on reload")
	}
}

// TestKeyPathCreatesDirectory vérifie que keyPath crée le répertoire
// s'il n'existe pas (cas "premier boot avec volume nommé vide").
func TestKeyPathCreatesDirectory(t *testing.T) {
	tmp := t.TempDir()
	target := filepath.Join(tmp, "deeper", "auth-keys")
	t.Setenv("AUTH_KEYS_DIR", target)

	got := keyPath("foo.pem")
	if got != filepath.Join(target, "foo.pem") {
		t.Fatalf("keyPath = %q, want %q", got, filepath.Join(target, "foo.pem"))
	}
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("keyPath did not create %s: %v", target, err)
	}
}
