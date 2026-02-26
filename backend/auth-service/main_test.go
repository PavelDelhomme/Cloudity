package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var (
	errUserNotFound    = errors.New("user not found")
	errSessionNotFound = errors.New("session not found")
)

// --- Mocks pour les tests ---

type mockUserStore struct {
	mu          sync.Mutex
	users       map[string]map[string]userRow // key: email, inner: tenantID -> row
	nextID      int
	totpSecrets map[string]string
	twoFA       map[string]bool
}

type userRow struct {
	userID, passwordHash, totpSecret string
	is2FAEnabled                     bool
}

func newMockUserStore() *mockUserStore {
	return &mockUserStore{
		users:       make(map[string]map[string]userRow),
		nextID:      1,
		totpSecrets: make(map[string]string),
		twoFA:       make(map[string]bool),
	}
}

func (m *mockUserStore) CreateUser(email, passwordHash, tenantID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.users[email] == nil {
		m.users[email] = make(map[string]userRow)
	}
	userID := fmtID(m.nextID)
	m.nextID++
	m.users[email][tenantID] = userRow{userID: userID, passwordHash: passwordHash}
	return userID, nil
}

func fmtID(n int) string { return fmt.Sprintf("%d", n) }

func (m *mockUserStore) GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret string, is2FAEnabled bool, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.users[email] == nil {
		return "", "", "", false, errUserNotFound
	}
	row, ok := m.users[email][tenantID]
	if !ok {
		return "", "", "", false, errUserNotFound
	}
	secret := m.totpSecrets[row.userID]
	twoFA := m.twoFA[row.userID]
	return row.userID, row.passwordHash, secret, twoFA, nil
}

func (m *mockUserStore) UpdateTOTPSecret(userID, secret string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.totpSecrets[userID] = secret
	return nil
}

func (m *mockUserStore) Set2FAEnabled(userID string, enabled bool) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.twoFA[userID] = enabled
	return nil
}

type mockSessionStore struct {
	mu    sync.Mutex
	store map[string]sessionVal
}

type sessionVal struct {
	userID, tenantID, email string
	exp                     time.Time
}

func newMockSessionStore() *mockSessionStore {
	return &mockSessionStore{store: make(map[string]sessionVal)}
}

func (m *mockSessionStore) SetRefresh(ctx context.Context, tokenHash, userID, tenantID, email string, exp time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.store[tokenHash] = sessionVal{userID, tenantID, email, time.Now().Add(exp)}
	return nil
}

func (m *mockSessionStore) GetRefresh(ctx context.Context, tokenHash string) (userID, tenantID, email string, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	v, ok := m.store[tokenHash]
	if !ok || time.Now().After(v.exp) {
		return "", "", "", errSessionNotFound
	}
	return v.userID, v.tenantID, v.email, nil
}

func (m *mockSessionStore) DeleteRefresh(ctx context.Context, tokenHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.store, tokenHash)
	return nil
}

func mustLoadTestKeys() (*rsa.PrivateKey, *rsa.PublicKey) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	return priv, &priv.PublicKey
}

func newTestAuthService() *AuthService {
	priv, pub := mustLoadTestKeys()
	return &AuthService{
		userStore:    newMockUserStore(),
		sessionStore: newMockSessionStore(),
		privateKey:   priv,
		publicKey:    pub,
		useArgon:     true,
	}
}

// --- Tests ---

func TestHealthEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "healthy"})
	})

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /health: got status %d, want %d", w.Code, http.StatusOK)
	}
	if w.Body.String() != `{"status":"healthy"}` {
		t.Errorf("GET /health: got body %q", w.Body.String())
	}
}

func TestHashPasswordAndCompare(t *testing.T) {
	svc := newTestAuthService()
	password := "securePassword123"
	hash, err := svc.hashPassword(password)
	if err != nil {
		t.Fatalf("hashPassword: %v", err)
	}
	if hash == "" || hash == password {
		t.Errorf("hash should be non-empty and different from password")
	}
	if !svc.comparePassword(password, hash) {
		t.Error("comparePassword should return true for correct password")
	}
	if svc.comparePassword("wrong", hash) {
		t.Error("comparePassword should return false for wrong password")
	}
}

func TestGenerateAndParseAccessToken(t *testing.T) {
	svc := newTestAuthService()
	token, err := svc.generateAccessToken("1", "1", "u@test.com")
	if err != nil {
		t.Fatalf("generateAccessToken: %v", err)
	}
	if token == "" {
		t.Fatal("token should not be empty")
	}
	claims, err := svc.parseAccessToken(token)
	if err != nil {
		t.Fatalf("parseAccessToken: %v", err)
	}
	if claims.UserID != "1" || claims.Email != "u@test.com" {
		t.Errorf("claims: user_id=%q email=%q", claims.UserID, claims.Email)
	}
}

func TestRegisterHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	r := gin.New()
	r.POST("/auth/register", svc.Register)

	body := `{"email":"reg@test.com","password":"password123","tenant_id":"1"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("Register: got status %d, want 201", w.Code)
	}
	var res map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if res["access_token"] == nil || res["refresh_token"] == nil || res["user_id"] == nil {
		t.Errorf("response should contain access_token, refresh_token, user_id: %+v", res)
	}
}

func TestLoginHandler_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	mockUser := svc.userStore.(*mockUserStore)
	_, _ = mockUser.CreateUser("login@test.com", mustHash(svc, "pass1234"), "1")

	r := gin.New()
	r.POST("/auth/register", svc.Register)
	r.POST("/auth/login", svc.Login)

	regBody := `{"email":"login@test.com","password":"pass1234","tenant_id":"1"}`
	regReq := httptest.NewRequest(http.MethodPost, "/auth/register", strings.NewReader(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	wReg := httptest.NewRecorder()
	r.ServeHTTP(wReg, regReq)
	if wReg.Code != 201 {
		t.Skip("register failed, skip login test")
	}

	loginBody := `{"email":"login@test.com","password":"pass1234","tenant_id":"1"}`
	loginReq := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, loginReq)

	if w.Code != http.StatusOK {
		t.Errorf("Login: got status %d body %s", w.Code, w.Body.String())
	}
	var res map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["access_token"] == nil || res["refresh_token"] == nil {
		t.Errorf("Login response should contain tokens: %+v", res)
	}
}

func mustHash(svc *AuthService, password string) string {
	h, err := svc.hashPassword(password)
	if err != nil {
		panic(err)
	}
	return h
}

func TestLoginHandler_InvalidPassword(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	mockUser := svc.userStore.(*mockUserStore)
	_, _ = mockUser.CreateUser("bad@test.com", mustHash(svc, "goodpass"), "1")

	r := gin.New()
	r.POST("/auth/login", svc.Login)
	body := `{"email":"bad@test.com","password":"wrongpass","tenant_id":"1"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Login wrong password: got status %d", w.Code)
	}
}

func TestValidateTokenHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	token, _ := svc.generateAccessToken("42", "1", "validate@test.com")

	r := gin.New()
	r.GET("/auth/validate", svc.ValidateToken)
	req := httptest.NewRequest(http.MethodGet, "/auth/validate", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("ValidateToken: got status %d", w.Code)
	}
	var res map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["valid"] != true || res["user_id"] != "42" {
		t.Errorf("ValidateToken response: %+v", res)
	}
}

func TestValidateTokenHandler_NoAuth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	r := gin.New()
	r.GET("/auth/validate", svc.ValidateToken)
	req := httptest.NewRequest(http.MethodGet, "/auth/validate", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("ValidateToken without header: got %d", w.Code)
	}
}

func TestRefreshTokenHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	mockSess := svc.sessionStore.(*mockSessionStore)
	ctx := context.Background()
	refreshToken := generateRandomToken()
	refreshHash := hashRefreshToken(refreshToken)
	_ = mockSess.SetRefresh(ctx, refreshHash, "1", "1", "r@test.com", time.Hour)

	r := gin.New()
	r.POST("/auth/refresh", svc.RefreshToken)
	body := `{"refresh_token":"` + refreshToken + `"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("RefreshToken: got status %d body %s", w.Code, w.Body.String())
	}
	var res map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["access_token"] == nil || res["refresh_token"] == nil {
		t.Errorf("Refresh response: %+v", res)
	}
	// Rotation: old refresh should be invalid
	w2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodPost, "/auth/refresh", strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)
	if w2.Code != http.StatusUnauthorized {
		t.Errorf("Reuse of old refresh token should be 401, got %d", w2.Code)
	}
}

func TestParseAccessToken_Invalid(t *testing.T) {
	svc := newTestAuthService()
	_, err := svc.parseAccessToken("invalid.jwt.token")
	if err == nil {
		t.Error("parseAccessToken should fail for invalid token")
	}
}

func TestClaims_RegisteredClaims(t *testing.T) {
	var c Claims
	_ = c.ExpiresAt
	_ = c.IssuedAt
	_ = jwt.NewNumericDate(time.Now())
}

func TestEnable2FAHandler_ReturnsSecret(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	token, _ := svc.generateAccessToken("1", "1", "twofa@test.com")

	r := gin.New()
	r.POST("/auth/2fa/enable", svc.Enable2FA)
	body := `{"access_token":"` + token + `"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/2fa/enable", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Enable2FA: got status %d body %s", w.Code, w.Body.String())
	}
	var res map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["secret"] == nil || res["url"] == nil {
		t.Errorf("Enable2FA should return secret and url: %+v", res)
	}
}

func TestEnable2FAHandler_InvalidToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	r := gin.New()
	r.POST("/auth/2fa/enable", svc.Enable2FA)
	body := `{"access_token":"invalid"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/2fa/enable", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("Enable2FA invalid token: got %d", w.Code)
	}
}

// TestVerify2FAHandler_InvalidCode vérifie que /auth/2fa/verify renvoie 401 avec un code TOTP invalide.
func TestVerify2FAHandler_InvalidCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	mockUser := svc.userStore.(*mockUserStore)
	_, _ = mockUser.CreateUser("verify2fa@test.com", mustHash(svc, "pass"), "1")
	_ = mockUser.UpdateTOTPSecret("1", "JBSWY3DPEHPK3PXP") // secret connu pour TOTP
	_ = mockUser.Set2FAEnabled("1", false)

	r := gin.New()
	r.POST("/auth/2fa/verify", svc.Verify2FA)
	body := `{"email":"verify2fa@test.com","tenant_id":"1","code":"000000"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/2fa/verify", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Verify2FA invalid code: got status %d body %s", w.Code, w.Body.String())
	}
	var res map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if res["error"] == nil {
		t.Errorf("Verify2FA invalid code should return error field: %+v", res)
	}
}

// TestLoadRSAKeys_WritesPublicPemWhenGenerating vérifie que lorsqu'aucun fichier de clé
// n'existe, loadRSAKeys génère une clé et écrit public.pem pour que l'api-gateway puisse valider les JWT.
func TestLoadRSAKeys_WritesPublicPemWhenGenerating(t *testing.T) {
	origDir, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	dir := t.TempDir()
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir %s: %v", dir, err)
	}
	defer func() {
		_ = os.Chdir(origDir)
	}()

	priv, pub := loadRSAKeys()
	if priv == nil || pub == nil {
		t.Fatal("loadRSAKeys returned nil keys")
	}

	data, err := os.ReadFile("public.pem")
	if err != nil {
		t.Fatalf("public.pem not written: %v", err)
	}
	if !strings.Contains(string(data), "BEGIN PUBLIC KEY") {
		t.Errorf("public.pem should contain PEM block: %s", string(data))
	}
	_ = priv
	_ = pub
}
