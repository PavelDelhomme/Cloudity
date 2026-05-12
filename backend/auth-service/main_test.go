package main

import (
	"context"
	"crypto/ed25519"
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
	userID, passwordHash, totpSecret, role string
	is2FAEnabled                           bool
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
	m.users[email][tenantID] = userRow{userID: userID, passwordHash: passwordHash, role: "user"}
	return userID, nil
}

func fmtID(n int) string { return fmt.Sprintf("%d", n) }

func (m *mockUserStore) GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret, role string, is2FAEnabled bool, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.users[email] == nil {
		return "", "", "", "", false, errUserNotFound
	}
	row, ok := m.users[email][tenantID]
	if !ok {
		return "", "", "", "", false, errUserNotFound
	}
	secret := m.totpSecrets[row.userID]
	twoFA := m.twoFA[row.userID]
	roleVal := row.role
	if roleVal == "" {
		roleVal = "user"
	}
	return row.userID, row.passwordHash, secret, roleVal, twoFA, nil
}

// promoteUser passe un utilisateur en `admin` dans le mock store (pour tests).
func (m *mockUserStore) promoteUser(email, tenantID, role string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	row, ok := m.users[email][tenantID]
	if !ok {
		return
	}
	row.role = role
	m.users[email][tenantID] = row
}

func (m *mockUserStore) GetUserRoleByID(userID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, byTenant := range m.users {
		for _, row := range byTenant {
			if row.userID == userID {
				if row.role == "" {
					return "user", nil
				}
				return row.role, nil
			}
		}
	}
	return "", errUserNotFound
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

func mustLoadTestEd25519Keys() (ed25519.PrivateKey, ed25519.PublicKey) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		panic(err)
	}
	return priv, pub
}

func newTestAuthService() *AuthService {
	priv, pub := mustLoadTestKeys()
	edPriv, edPub := mustLoadTestEd25519Keys()
	return &AuthService{
		userStore:    newMockUserStore(),
		sessionStore: newMockSessionStore(),
		privateKey:   priv,
		publicKey:    pub,
		edPrivateKey: edPriv,
		edPublicKey:  edPub,
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
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Errorf("hash should be Argon2id, got prefix=%q", hash[:min(len(hash), 12)])
	}
	if !svc.comparePassword(password, hash) {
		t.Error("comparePassword should return true for correct password")
	}
	if svc.comparePassword("wrong", hash) {
		t.Error("comparePassword should return false for wrong password")
	}
}

// TestHardenedArgon2idParams_DefaultsAndOverride vérifie que les paramètres
// par défaut sont bien ceux de la norme (m=64MB t=3 p=4 — cf. CRYPTO-NORME.md
// § 3.1) et que l'override par variables d'environnement fonctionne.
func TestHardenedArgon2idParams_DefaultsAndOverride(t *testing.T) {
	t.Setenv("ARGON2_MEMORY_KB", "")
	t.Setenv("ARGON2_TIME", "")
	t.Setenv("ARGON2_PARALLELISM", "")

	def := hardenedArgon2idParams()
	if def.Memory != 64*1024 {
		t.Errorf("default Memory = %d, want %d", def.Memory, 64*1024)
	}
	if def.Iterations != 3 {
		t.Errorf("default Iterations = %d, want 3", def.Iterations)
	}
	if def.Parallelism != 4 {
		t.Errorf("default Parallelism = %d, want 4", def.Parallelism)
	}

	t.Setenv("ARGON2_MEMORY_KB", "131072")
	t.Setenv("ARGON2_TIME", "5")
	t.Setenv("ARGON2_PARALLELISM", "8")
	got := hardenedArgon2idParams()
	if got.Memory != 131072 {
		t.Errorf("override Memory = %d, want 131072", got.Memory)
	}
	if got.Iterations != 5 {
		t.Errorf("override Iterations = %d, want 5", got.Iterations)
	}
	if got.Parallelism != 8 {
		t.Errorf("override Parallelism = %d, want 8", got.Parallelism)
	}

	// Un override invalide / trop bas est ignoré (m doit rester ≥ 8 MiB).
	t.Setenv("ARGON2_MEMORY_KB", "100")
	floor := hardenedArgon2idParams()
	if floor.Memory == 100 {
		t.Errorf("Memory floor not enforced, got %d", floor.Memory)
	}
}

func TestGenerateAndParseAccessToken(t *testing.T) {
	svc := newTestAuthService()
	token, err := svc.generateAccessToken("1", "1", "u@test.com", "user")
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
	if claims.Role != "user" {
		t.Errorf("claims.Role = %q, want %q", claims.Role, "user")
	}
}

// TestGenerateAccessToken_IsEdDSA — Phase B (cf. CRYPTO-NORME.md § 5.2) :
// vérifie que les NOUVEAUX tokens sont signés en EdDSA (Ed25519) avec le
// header `kid="ed25519-1"`, et plus en RS256.
func TestGenerateAccessToken_IsEdDSA(t *testing.T) {
	svc := newTestAuthService()
	tokenStr, err := svc.generateAccessToken("42", "1", "ed@test.com", "user")
	if err != nil {
		t.Fatalf("generateAccessToken: %v", err)
	}
	parsed, _, err := jwt.NewParser().ParseUnverified(tokenStr, jwt.MapClaims{})
	if err != nil {
		t.Fatalf("ParseUnverified: %v", err)
	}
	if alg := parsed.Method.Alg(); alg != "EdDSA" {
		t.Errorf("alg = %q, want EdDSA", alg)
	}
	if kid, _ := parsed.Header["kid"].(string); kid != kidEd25519 {
		t.Errorf("kid = %q, want %q", kid, kidEd25519)
	}
}

// TestParseAccessToken_AcceptsLegacyRS256 — fenêtre de transition Phase B :
// les tokens encore valides signés en RS256 avant la migration doivent
// continuer à être acceptés par parseAccessToken jusqu'à leur expiration.
func TestParseAccessToken_AcceptsLegacyRS256(t *testing.T) {
	svc := newTestAuthService()
	claims := Claims{
		UserID:   "99",
		TenantID: "1",
		Email:    "legacy@test.com",
		Role:     "user",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = kidRSA
	tokenStr, err := tok.SignedString(svc.privateKey)
	if err != nil {
		t.Fatalf("sign RS256: %v", err)
	}
	got, err := svc.parseAccessToken(tokenStr)
	if err != nil {
		t.Fatalf("parseAccessToken legacy RS256: %v", err)
	}
	if got.UserID != "99" || got.Email != "legacy@test.com" {
		t.Errorf("legacy claims: %+v", got)
	}
}

// TestParseAccessToken_RejectsAlgConfusion — refus du downgrade RS256→none
// ou kid invalide : protection classique contre les attaques `alg:none` ou
// les tentatives de mismatch kid/alg.
func TestParseAccessToken_RejectsAlgConfusion(t *testing.T) {
	svc := newTestAuthService()
	claims := Claims{
		UserID: "1", TenantID: "1", Email: "x@test.com", Role: "user",
		RegisteredClaims: jwt.RegisteredClaims{ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Minute))},
	}
	// Token EdDSA mais avec kid="rs256-1" → mismatch détecté.
	tok := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tok.Header["kid"] = kidRSA
	bad, err := tok.SignedString(svc.edPrivateKey)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	if _, err := svc.parseAccessToken(bad); err == nil {
		t.Error("expected error for kid=rs256-1 with EdDSA signature, got nil")
	}
	// Kid inconnu → refusé.
	tok2 := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	tok2.Header["kid"] = "intruder-1"
	bad2, _ := tok2.SignedString(svc.edPrivateKey)
	if _, err := svc.parseAccessToken(bad2); err == nil {
		t.Error("expected error for unknown kid, got nil")
	}
}

func TestGenerateAccessToken_AdminRoleClaim(t *testing.T) {
	svc := newTestAuthService()
	token, err := svc.generateAccessToken("1", "1", "admin@test.com", "admin")
	if err != nil {
		t.Fatalf("generateAccessToken: %v", err)
	}
	claims, err := svc.parseAccessToken(token)
	if err != nil {
		t.Fatalf("parseAccessToken: %v", err)
	}
	if claims.Role != "admin" {
		t.Errorf("claims.Role = %q, want %q", claims.Role, "admin")
	}
}

func TestLoginHandler_AdminRoleInToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newTestAuthService()
	mockUser := svc.userStore.(*mockUserStore)
	_, _ = mockUser.CreateUser("admin@cloudity.local", mustHash(svc, "Admin123!"), "1")
	mockUser.promoteUser("admin@cloudity.local", "1", "admin")

	r := gin.New()
	r.POST("/auth/login", svc.Login)
	body := `{"email":"admin@cloudity.local","password":"Admin123!","tenant_id":"1"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("Login admin: got %d body %s", w.Code, w.Body.String())
	}
	var res map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&res); err != nil {
		t.Fatalf("decode: %v", err)
	}
	at, _ := res["access_token"].(string)
	claims, err := svc.parseAccessToken(at)
	if err != nil {
		t.Fatalf("parseAccessToken: %v", err)
	}
	if claims.Role != "admin" {
		t.Errorf("admin login: role=%q, want admin", claims.Role)
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
	token, _ := svc.generateAccessToken("42", "1", "validate@test.com", "user")

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
	token, _ := svc.generateAccessToken("1", "1", "twofa@test.com", "user")

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
