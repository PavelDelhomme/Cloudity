package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// memE2EBootstrapKV : backend mémoire pour les tests (même sémantique GetDel que Redis).
type memE2EBootstrapKV struct {
	mu sync.Mutex
	m  map[string]string
}

func newMemE2EBootstrapKV() *memE2EBootstrapKV {
	return &memE2EBootstrapKV{m: make(map[string]string)}
}

func (k *memE2EBootstrapKV) SetEX(_ context.Context, key, val string, _ time.Duration) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	k.m[key] = val
	return nil
}

func (k *memE2EBootstrapKV) GetDel(_ context.Context, key string) (string, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	v, ok := k.m[key]
	if !ok {
		return "", redis.Nil
	}
	delete(k.m, key)
	return v, nil
}

func TestE2EBootstrapRoutesNotRegisteredInProductionGOEnv(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("CLOUDITY_ALLOW_E2E_BOOTSTRAP", "1")
	t.Setenv("E2E_BOOTSTRAP_SECRET", strings.Repeat("s", 32))
	t.Setenv("GO_ENV", "production")
	t.Cleanup(func() {
		_ = os.Unsetenv("CLOUDITY_ALLOW_E2E_BOOTSTRAP")
		_ = os.Unsetenv("E2E_BOOTSTRAP_SECRET")
		_ = os.Unsetenv("GO_ENV")
	})

	svc := newTestAuthService()
	r := gin.New()
	registerE2EBootstrapRoutesIfEnabled(r, svc)

	req := httptest.NewRequest(http.MethodPost, "/auth/e2e/bootstrap-mint", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("sans route enregistrée Gin renvoie 404, got %d body=%s", w.Code, w.Body.String())
	}
}

func TestE2EBootstrapMintExchange_OneTime(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("CLOUDITY_ALLOW_E2E_BOOTSTRAP", "1")
	t.Setenv("GO_ENV", "development")
	t.Setenv("E2E_BOOTSTRAP_SECRET", strings.Repeat("b", 32))
	t.Cleanup(func() {
		_ = os.Unsetenv("CLOUDITY_ALLOW_E2E_BOOTSTRAP")
		_ = os.Unsetenv("E2E_BOOTSTRAP_SECRET")
		_ = os.Unsetenv("GO_ENV")
	})

	svc := newTestAuthService()
	mockUser := svc.userStore.(*mockUserStore)
	_, _ = mockUser.CreateUser("e2e-bootstrap@test.com", mustHash(svc, "irrelevant"), "1")

	r := gin.New()
	r.POST("/auth/e2e/bootstrap-mint", svc.E2EBootstrapMint)
	r.POST("/auth/e2e/bootstrap-exchange", svc.E2EBootstrapExchange)

	// Mauvais secret
	badMint := `{"bootstrap_secret":"wrongwrongwrongwrongwrongwrongwr","email":"e2e-bootstrap@test.com","tenant_id":"1"}`
	reqBad := httptest.NewRequest(http.MethodPost, "/auth/e2e/bootstrap-mint", strings.NewReader(badMint))
	reqBad.Header.Set("Content-Type", "application/json")
	wBad := httptest.NewRecorder()
	r.ServeHTTP(wBad, reqBad)
	if wBad.Code != http.StatusUnauthorized {
		t.Fatalf("bad secret: want 401 got %d %s", wBad.Code, wBad.Body.String())
	}

	goodMint := `{"bootstrap_secret":"` + strings.Repeat("b", 32) + `","email":"e2e-bootstrap@test.com","tenant_id":"1"}`
	reqMint := httptest.NewRequest(http.MethodPost, "/auth/e2e/bootstrap-mint", strings.NewReader(goodMint))
	reqMint.Header.Set("Content-Type", "application/json")
	wMint := httptest.NewRecorder()
	r.ServeHTTP(wMint, reqMint)
	if wMint.Code != http.StatusOK {
		t.Fatalf("mint: want 200 got %d %s", wMint.Code, wMint.Body.String())
	}
	var mintRes struct {
		OneTimeToken string `json:"one_time_token"`
	}
	if err := json.NewDecoder(wMint.Body).Decode(&mintRes); err != nil {
		t.Fatalf("decode mint: %v", err)
	}
	if mintRes.OneTimeToken == "" {
		t.Fatal("empty one_time_token")
	}

	exBody := `{"one_time_token":"` + mintRes.OneTimeToken + `"}`
	reqEx := httptest.NewRequest(http.MethodPost, "/auth/e2e/bootstrap-exchange", strings.NewReader(exBody))
	reqEx.Header.Set("Content-Type", "application/json")
	wEx := httptest.NewRecorder()
	r.ServeHTTP(wEx, reqEx)
	if wEx.Code != http.StatusOK {
		t.Fatalf("exchange 1: want 200 got %d %s", wEx.Code, wEx.Body.String())
	}
	var tokRes map[string]interface{}
	if err := json.NewDecoder(wEx.Body).Decode(&tokRes); err != nil {
		t.Fatalf("decode exchange: %v", err)
	}
	if tokRes["access_token"] == nil || tokRes["refresh_token"] == nil {
		t.Fatalf("missing tokens: %+v", tokRes)
	}

	reqEx2 := httptest.NewRequest(http.MethodPost, "/auth/e2e/bootstrap-exchange", strings.NewReader(exBody))
	reqEx2.Header.Set("Content-Type", "application/json")
	wEx2 := httptest.NewRecorder()
	r.ServeHTTP(wEx2, reqEx2)
	if wEx2.Code != http.StatusUnauthorized {
		t.Fatalf("replay exchange: want 401 got %d %s", wEx2.Code, wEx2.Body.String())
	}
}

func TestE2EBootstrapMint_RejectedWhen2FAEnabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("CLOUDITY_ALLOW_E2E_BOOTSTRAP", "1")
	t.Setenv("GO_ENV", "development")
	t.Setenv("E2E_BOOTSTRAP_SECRET", strings.Repeat("c", 32))
	t.Cleanup(func() {
		_ = os.Unsetenv("CLOUDITY_ALLOW_E2E_BOOTSTRAP")
		_ = os.Unsetenv("E2E_BOOTSTRAP_SECRET")
		_ = os.Unsetenv("GO_ENV")
	})

	svc := newTestAuthService()
	mockUser := svc.userStore.(*mockUserStore)
	uid, _ := mockUser.CreateUser("e2e-2fa@test.com", mustHash(svc, "x"), "1")
	_ = mockUser.Set2FAEnabled(uid, true)

	r := gin.New()
	r.POST("/auth/e2e/bootstrap-mint", svc.E2EBootstrapMint)

	body := `{"bootstrap_secret":"` + strings.Repeat("c", 32) + `","email":"e2e-2fa@test.com","tenant_id":"1"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/e2e/bootstrap-mint", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("2fa user: want 403 got %d %s", w.Code, w.Body.String())
	}
}
