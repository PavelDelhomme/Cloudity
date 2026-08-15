package main

import (
	"os"
	"testing"
)

func TestDevQuickLoginEnvOK(t *testing.T) {
	t.Setenv("CLOUDITY_ALLOW_DEV_QUICK_LOGIN", "")
	t.Setenv("GO_ENV", "development")
	t.Setenv("NODE_ENV", "development")
	if devQuickLoginEnvOK() {
		t.Fatal("expected false when flag unset")
	}

	t.Setenv("CLOUDITY_ALLOW_DEV_QUICK_LOGIN", "1")
	if !devQuickLoginEnvOK() {
		t.Fatal("expected true in development")
	}

	t.Setenv("GO_ENV", "production")
	if devQuickLoginEnvOK() {
		t.Fatal("expected false when GO_ENV=production")
	}
	_ = os.Unsetenv("GO_ENV")
	t.Setenv("NODE_ENV", "production")
	if devQuickLoginEnvOK() {
		t.Fatal("expected false when NODE_ENV=production")
	}
}
