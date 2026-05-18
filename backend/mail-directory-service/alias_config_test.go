package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestNormalizeAliasEmailLocalPart(t *testing.T) {
	t.Setenv("MAIL_PRIMARY_DOMAIN", "exemple.ovh")
	t.Setenv("MAIL_ALIAS_SUBDOMAIN", "")
	got, err := normalizeAliasEmail("newsletter", "user@exemple.ovh")
	if err != nil {
		t.Fatal(err)
	}
	if got != "newsletter@alias.exemple.ovh" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizeAliasEmailFullAddress(t *testing.T) {
	t.Setenv("MAIL_PRIMARY_DOMAIN", "")
	t.Setenv("MAIL_ALIAS_SUBDOMAIN", "")
	got, err := normalizeAliasEmail("a@b.c", "user@x.com")
	if err != nil || got != "a@b.c" {
		t.Fatalf("got %q err=%v", got, err)
	}
}

func TestValidateAliasEmailStrict(t *testing.T) {
	t.Setenv("MAIL_PRIMARY_DOMAIN", "exemple.ovh")
	t.Setenv("MAIL_ALIAS_SUBDOMAIN", "")
	if err := validateAliasEmailForAccount("x@alias.exemple.ovh", ""); err != nil {
		t.Fatal(err)
	}
	if err := validateAliasEmailForAccount("x@wrong.com", ""); err == nil {
		t.Fatal("expected validation error")
	}
}

func TestEffectiveAliasHostSuffixFromAccount(t *testing.T) {
	os.Unsetenv("MAIL_PRIMARY_DOMAIN")
	os.Unsetenv("MAIL_ALIAS_SUBDOMAIN")
	if got := effectiveAliasHostSuffix("test@cloudity.local"); got != "alias.cloudity.local" {
		t.Fatalf("got %q", got)
	}
}

func TestGetMailAliasConfigEndpoint(t *testing.T) {
	t.Setenv("MAIL_PRIMARY_DOMAIN", "exemple.ovh")
	t.Setenv("MAIL_ALIAS_SUBDOMAIN", "")
	r := setupRouter(nil)
	req := httptest.NewRequest(http.MethodGet, "/mail/me/alias-config", nil)
	setAdminMailHeaders(req)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "alias.exemple.ovh") {
		t.Fatalf("body %s", w.Body.String())
	}
}
