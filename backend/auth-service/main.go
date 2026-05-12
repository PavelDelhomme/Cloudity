package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"database/sql"
	"encoding/hex"
	"encoding/pem"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/alexedwards/argon2id"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	"github.com/lib/pq"
	"github.com/pavel/cloudity/internalsec"
	"github.com/pquerna/otp/totp"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

// accessTokenDuration est fixé au démarrage (voir init) : défaut 60 min, surcharge ACCESS_TOKEN_DURATION_MINUTES (5–1440).
var accessTokenDuration time.Duration

const refreshTokenDuration = 30 * 24 * time.Hour // 30 jours : session longue, sécurisée par rotation à chaque refresh

// newRedisClient construit le client Redis. Si REDIS_TLS=1 (ou true/on),
// connexion TLS vers Redis avec vérification de la CA (fichier REDIS_TLS_CA,
// défaut /run/step/ca.pem). REDIS_URL reste au format host:port (ex. redis:6379).
func newRedisClient() *redis.Client {
	addr := strings.TrimSpace(os.Getenv("REDIS_URL"))
	if addr == "" {
		addr = "localhost:6379"
	}
	password := os.Getenv("REDIS_PASSWORD")
	opts := &redis.Options{
		Addr:     addr,
		Password: password,
		DB:       0,
	}
	tlsFlag := strings.TrimSpace(os.Getenv("REDIS_TLS"))
	if tlsFlag == "1" || strings.EqualFold(tlsFlag, "true") || strings.EqualFold(tlsFlag, "on") {
		caPath := strings.TrimSpace(os.Getenv("REDIS_TLS_CA"))
		if caPath == "" {
			caPath = "/run/step/ca.pem"
		}
		caPEM, err := os.ReadFile(caPath)
		if err != nil {
			log.Fatalf("REDIS_TLS: lecture CA %s: %v", caPath, err)
		}
		pool := x509.NewCertPool()
		if !pool.AppendCertsFromPEM(caPEM) {
			log.Fatalf("REDIS_TLS: PEM CA invalide dans %s", caPath)
		}
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
			if i := strings.LastIndex(addr, ":"); i > 0 {
				host = addr[:i]
			}
		}
		opts.TLSConfig = &tls.Config{
			MinVersion: tls.VersionTLS12,
			RootCAs:    pool,
			ServerName: host,
		}
	}
	return redis.NewClient(opts)
}

// loginResponseFloor borne inférieure sur la durée des réponses /auth/login (hors erreur
// de parsing JSON 400) pour atténuer un canal auxiliaire « user inconnu » vs « mauvais mot de passe »
// (comparaison de temps réseau — pas une garantie cryptographique).
const loginResponseFloor = 70 * time.Millisecond

func padLoginResponse(start time.Time) {
	if start.IsZero() {
		return
	}
	if elapsed := time.Since(start); elapsed < loginResponseFloor {
		time.Sleep(loginResponseFloor - elapsed)
	}
}

func init() {
	accessTokenDuration = parseAccessTokenDurationMinutes()
}

func parseAccessTokenDurationMinutes() time.Duration {
	v := strings.TrimSpace(os.Getenv("ACCESS_TOKEN_DURATION_MINUTES"))
	if v == "" {
		return 60 * time.Minute
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 5 || n > 24*60 {
		log.Printf("auth-service: ACCESS_TOKEN_DURATION_MINUTES=%q invalide (entier 5–1440), utilisation de 60 min", v)
		return 60 * time.Minute
	}
	return time.Duration(n) * time.Minute
}

// UserStore abstrait l'accès aux utilisateurs (pour tests).
type UserStore interface {
	CreateUser(email, passwordHash, tenantID string) (userID string, err error)
	GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret, role string, is2FAEnabled bool, err error)
	GetUserRoleByID(userID string) (role string, err error)
	UpdateTOTPSecret(userID, secret string) error
	Set2FAEnabled(userID string, enabled bool) error
}

// SessionStore abstrait le stockage des refresh tokens (pour tests).
type SessionStore interface {
	SetRefresh(ctx context.Context, tokenHash, userID, tenantID, email string, exp time.Duration) error
	GetRefresh(ctx context.Context, tokenHash string) (userID, tenantID, email string, err error)
	DeleteRefresh(ctx context.Context, tokenHash string) error
}

type AuthService struct {
	userStore    UserStore
	sessionStore SessionStore
	// privateKey/publicKey : RSA-2048 — conservés pour vérifier les tokens
	// existants (refresh tokens jusqu'à 7-30j, access tokens jusqu'à 60min)
	// signés en RS256 avant la migration EdDSA. Plus de NOUVEAU token signé
	// en RS256 depuis cette version.
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	// edPrivateKey/edPublicKey : Ed25519 — utilisés pour signer TOUS les
	// nouveaux tokens. Plan migration : docs/securite/CRYPTO-NORME.md § 5.2.
	edPrivateKey ed25519.PrivateKey
	edPublicKey  ed25519.PublicKey
	useArgon     bool // true = Argon2id, false = bcrypt (rétrocompat)
}

// kidEd25519 / kidRSA — identifiants stables des clés publiques (header `kid`
// du JWT). Utilisés par api-gateway pour sélectionner la bonne clé de
// vérification. NE PAS RENOMMER sans coordonner les deux services.
const (
	kidEd25519 = "ed25519-1"
	kidRSA     = "rs256-1"
)

type Claims struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Email    string `json:"email"`
	Role     string `json:"role,omitempty"`
	jwt.RegisteredClaims
}

func main() {
	godotenv.Load()

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	rdb := newRedisClient()

	privateKey, publicKey := loadRSAKeys()
	edPrivateKey, edPublicKey := loadEd25519Keys()

	authService := &AuthService{
		userStore:    &postgresUserStore{db: db},
		sessionStore: &redisSessionStore{rdb: rdb},
		privateKey:   privateKey,
		publicKey:    publicKey,
		edPrivateKey: edPrivateKey,
		edPublicKey:  edPublicKey,
		useArgon:     true,
	}

	r := gin.Default()
	r.SetTrustedProxies(nil)
	r.POST("/auth/register", authService.Register)
	r.POST("/auth/login", authService.Login)
	r.POST("/auth/refresh", authService.RefreshToken)
	r.POST("/auth/2fa/enable", authService.Enable2FA)
	r.POST("/auth/2fa/verify", authService.Verify2FA)
	r.GET("/auth/validate", authService.ValidateToken)
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "healthy"}) })

	// Phase W1 (Q17=A) : WebAuthn / passkeys pour /4dm1n.
	// Désactivé silencieusement si la conf est invalide (ex. RP_ID vide en prod).
	NewWebAuthnService(loadWebAuthnConfig(), db, rdb, authService).RegisterRoutes(r)

	listenAddr := ":8081"
	mtlsCfg := internalsec.ConfigFromEnv()
	if mtlsCfg.Mode == internalsec.ModeOff {
		log.Println("Auth Service starting on port 8081 (HTTP plain)…")
		if err := r.Run(listenAddr); err != nil {
			log.Fatalf("auth-service: serve: %v", err)
		}
		return
	}

	tlsCfg, _, err := internalsec.ServerTLS(mtlsCfg)
	if err != nil {
		log.Fatalf("auth-service: ServerTLS (mode=%s): %v", mtlsCfg.Mode, err)
	}
	srv := &http.Server{
		Addr:              listenAddr,
		Handler:           r,
		TLSConfig:         tlsCfg,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("Auth Service starting on port 8081 (mTLS mode=%s, ca=%s)…", mtlsCfg.Mode, mtlsCfg.CAFile)
	if err := srv.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
		log.Fatalf("auth-service: serveTLS: %v", err)
	}
}

// --- Password hashing (Argon2id ou bcrypt pour rétrocompat) ---

// hardenedArgon2idParams — paramètres explicites alignés sur la norme
// Cloudity (cf. docs/securite/CRYPTO-NORME.md § 3.1). 6× plus coûteux
// que argon2id.DefaultParams (m=64MB t=1 p=2 → m=64MB t=3 p=4).
//
// Override par environnement via ARGON2_MEMORY_KB / ARGON2_TIME / ARGON2_PARALLELISM.
// Recalibrage attendu tous les 18-24 mois (cf. OWASP Password Storage Cheat Sheet).
func hardenedArgon2idParams() *argon2id.Params {
	p := &argon2id.Params{
		Memory:      64 * 1024, // 64 MiB
		Iterations:  3,
		Parallelism: 4,
		SaltLength:  16,
		KeyLength:   32,
	}
	if v := os.Getenv("ARGON2_MEMORY_KB"); v != "" {
		if n, err := strconv.ParseUint(v, 10, 32); err == nil && n >= 8*1024 {
			p.Memory = uint32(n)
		}
	}
	if v := os.Getenv("ARGON2_TIME"); v != "" {
		if n, err := strconv.ParseUint(v, 10, 32); err == nil && n >= 1 {
			p.Iterations = uint32(n)
		}
	}
	if v := os.Getenv("ARGON2_PARALLELISM"); v != "" {
		if n, err := strconv.ParseUint(v, 10, 8); err == nil && n >= 1 {
			p.Parallelism = uint8(n)
		}
	}
	return p
}

func (a *AuthService) hashPassword(password string) (string, error) {
	if a.useArgon {
		return argon2id.CreateHash(password, hardenedArgon2idParams())
	}
	h, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(h), err
}

func (a *AuthService) comparePassword(password, hash string) bool {
	if strings.HasPrefix(hash, "$argon2id$") {
		ok, _ := argon2id.ComparePasswordAndHash(password, hash)
		return ok
	}
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// --- Postgres UserStore ---

type postgresUserStore struct{ db *sql.DB }

func (p *postgresUserStore) CreateUser(email, passwordHash, tenantID string) (string, error) {
	var userID string
	err := p.db.QueryRow(`
		INSERT INTO users (email, password_hash, tenant_id)
		VALUES ($1, $2, $3)
		RETURNING id::text
	`, email, passwordHash, tenantID).Scan(&userID)
	return userID, err
}

func (p *postgresUserStore) GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret, role string, is2FAEnabled bool, err error) {
	err = p.db.QueryRow(`
		SELECT id::text, password_hash, COALESCE(totp_secret,''), COALESCE(role,'user'), is_2fa_enabled
		FROM users WHERE email = $1 AND tenant_id::text = $2 AND is_active = true
	`, email, tenantID).Scan(&userID, &passwordHash, &totpSecret, &role, &is2FAEnabled)
	if err != nil {
		return "", "", "", "", false, err
	}
	return userID, passwordHash, totpSecret, role, is2FAEnabled, nil
}

func (p *postgresUserStore) GetUserRoleByID(userID string) (string, error) {
	var role string
	err := p.db.QueryRow(`SELECT COALESCE(role,'user') FROM users WHERE id::text = $1 AND is_active = true`, userID).Scan(&role)
	if err != nil {
		return "", err
	}
	return role, nil
}

func (p *postgresUserStore) UpdateTOTPSecret(userID, secret string) error {
	_, err := p.db.Exec(`UPDATE users SET totp_secret = $1 WHERE id::text = $2`, secret, userID)
	return err
}

func (p *postgresUserStore) Set2FAEnabled(userID string, enabled bool) error {
	_, err := p.db.Exec(`UPDATE users SET is_2fa_enabled = $1 WHERE id::text = $2`, enabled, userID)
	return err
}

// --- Redis SessionStore ---

type redisSessionStore struct{ rdb *redis.Client }

const refreshKeyPrefix = "refresh:"

func (r *redisSessionStore) SetRefresh(ctx context.Context, tokenHash, userID, tenantID, email string, exp time.Duration) error {
	v := userID + "|" + tenantID + "|" + email
	return r.rdb.Set(ctx, refreshKeyPrefix+tokenHash, v, exp).Err()
}

func (r *redisSessionStore) GetRefresh(ctx context.Context, tokenHash string) (userID, tenantID, email string, err error) {
	v, err := r.rdb.Get(ctx, refreshKeyPrefix+tokenHash).Result()
	if err != nil {
		return "", "", "", err
	}
	parts := strings.SplitN(v, "|", 3)
	if len(parts) != 3 {
		return "", "", "", sql.ErrNoRows
	}
	return parts[0], parts[1], parts[2], nil
}

func (r *redisSessionStore) DeleteRefresh(ctx context.Context, tokenHash string) error {
	return r.rdb.Del(ctx, refreshKeyPrefix+tokenHash).Err()
}

// --- JWT ---

func (a *AuthService) generateAccessToken(userID, tenantID, email, role string) (string, error) {
	if strings.TrimSpace(role) == "" {
		role = "user"
	}
	claims := Claims{
		UserID:   userID,
		TenantID: tenantID,
		Email:    email,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(accessTokenDuration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	// Phase B (cf. CRYPTO-NORME.md § 5.2) : tous les nouveaux access tokens
	// sont signés en EdDSA (Ed25519). Header `kid` posé pour qu'api-gateway
	// puisse sélectionner la bonne clé.
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims)
	token.Header["kid"] = kidEd25519
	return token.SignedString(a.edPrivateKey)
}

// issueTokens émet une paire access + refresh et stocke le hash du refresh
// dans Redis. Mutualisé entre login mot de passe + 2FA + WebAuthn pour ne
// jamais désynchroniser la durée de vie ni l'algo de signature.
func (a *AuthService) issueTokens(ctx context.Context, userID, tenantID, email, role string) (access, refresh string, err error) {
	access, err = a.generateAccessToken(userID, tenantID, email, role)
	if err != nil {
		return "", "", err
	}
	refresh = generateRandomToken()
	if err := a.sessionStore.SetRefresh(ctx, hashRefreshToken(refresh), userID, tenantID, email, refreshTokenDuration); err != nil {
		return "", "", err
	}
	return access, refresh, nil
}

// parseAccessToken vérifie un access token. Accepte EdDSA (nouveaux tokens —
// kid="ed25519-1") ET RS256 (anciens tokens — kid="rs256-1" ou kid absent),
// pour la fenêtre de transition Phase B → Phase C (cf. CRYPTO-NORME.md § 5.2).
func (a *AuthService) parseAccessToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		kid, _ := t.Header["kid"].(string)
		switch kid {
		case kidEd25519:
			if _, ok := t.Method.(*jwt.SigningMethodEd25519); !ok {
				return nil, fmt.Errorf("unexpected signing method %v for kid=%s", t.Method.Alg(), kid)
			}
			return a.edPublicKey, nil
		case kidRSA, "":
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method %v for kid=%s", t.Method.Alg(), kid)
			}
			return a.publicKey, nil
		default:
			return nil, fmt.Errorf("unknown kid %q", kid)
		}
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}

func hashRefreshToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// --- Handlers ---

func (a *AuthService) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
		TenantID string `json:"tenant_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	hashedPassword, err := a.hashPassword(req.Password)
	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to hash password"})
		return
	}

	userID, err := a.userStore.CreateUser(req.Email, hashedPassword, req.TenantID)
	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok && pqErr.Code == "23505" {
			// Message volontairement générique : ne pas confirmer à distance qu’un email existe déjà (énumération).
			c.JSON(http.StatusConflict, gin.H{"error": "registration could not be completed"})
			return
		}
		c.JSON(500, gin.H{"error": "Failed to create user"})
		return
	}

	role, _ := a.userStore.GetUserRoleByID(userID)
	accessToken, _ := a.generateAccessToken(userID, req.TenantID, req.Email, role)
	refreshToken := generateRandomToken()
	refreshHash := hashRefreshToken(refreshToken)
	ctx := c.Request.Context()
	_ = a.sessionStore.SetRefresh(ctx, refreshHash, userID, req.TenantID, req.Email, refreshTokenDuration)

	c.JSON(201, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user_id":       userID,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}

func (a *AuthService) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
		TenantID string `json:"tenant_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	start := time.Now()

	userID, passwordHash, _, role, is2FAEnabled, err := a.userStore.GetUserByEmailTenant(req.Email, req.TenantID)
	if err == sql.ErrNoRows || err != nil {
		padLoginResponse(start)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !a.comparePassword(req.Password, passwordHash) {
		padLoginResponse(start)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if is2FAEnabled {
		padLoginResponse(start)
		c.JSON(200, gin.H{
			"requires_2fa": true,
			"user_id":      userID,
			"temp_token":   "", // en production on pourrait émettre un token court pour l'étape 2FA
		})
		return
	}

	accessToken, _ := a.generateAccessToken(userID, req.TenantID, req.Email, role)
	refreshToken := generateRandomToken()
	refreshHash := hashRefreshToken(refreshToken)
	ctx := c.Request.Context()
	_ = a.sessionStore.SetRefresh(ctx, refreshHash, userID, req.TenantID, req.Email, refreshTokenDuration)

	padLoginResponse(start)
	c.JSON(200, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user_id":       userID,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}

func (a *AuthService) RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	refreshHash := hashRefreshToken(req.RefreshToken)
	ctx := c.Request.Context()
	userID, tenantID, email, err := a.sessionStore.GetRefresh(ctx, refreshHash)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired refresh token"})
		return
	}

	_ = a.sessionStore.DeleteRefresh(ctx, refreshHash) // rotation

	role, _ := a.userStore.GetUserRoleByID(userID)
	accessToken, _ := a.generateAccessToken(userID, tenantID, email, role)
	newRefresh := generateRandomToken()
	newHash := hashRefreshToken(newRefresh)
	_ = a.sessionStore.SetRefresh(ctx, newHash, userID, tenantID, email, refreshTokenDuration)

	c.JSON(200, gin.H{
		"access_token":  accessToken,
		"refresh_token": newRefresh,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}

func (a *AuthService) ValidateToken(c *gin.Context) {
	auth := c.GetHeader("Authorization")
	if auth == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing Authorization header"})
		return
	}
	const prefix = "Bearer "
	if !strings.HasPrefix(auth, prefix) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid Authorization header"})
		return
	}
	tokenString := strings.TrimPrefix(auth, prefix)
	claims, err := a.parseAccessToken(tokenString)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}
	c.JSON(200, gin.H{
		"user_id":   claims.UserID,
		"tenant_id": claims.TenantID,
		"email":     claims.Email,
		"role":      claims.Role,
		"valid":     true,
	})
}

func (a *AuthService) Enable2FA(c *gin.Context) {
	var req struct {
		AccessToken string `json:"access_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	claims, err := a.parseAccessToken(req.AccessToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Cloudity",
		AccountName: claims.Email,
	})
	if err != nil {
		c.JSON(500, gin.H{"error": "failed to generate 2FA secret"})
		return
	}
	if err := a.userStore.UpdateTOTPSecret(claims.UserID, key.Secret()); err != nil {
		c.JSON(500, gin.H{"error": "failed to save secret"})
		return
	}
	c.JSON(200, gin.H{
		"secret":  key.Secret(),
		"url":     key.URL(),
		"message": "Enable 2FA in your app with this secret; then call /auth/2fa/verify with the code.",
	})
}

func (a *AuthService) Verify2FA(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		TenantID string `json:"tenant_id" binding:"required"`
		Code     string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}
	userID, _, totpSecret, role, is2FAEnabled, err := a.userStore.GetUserByEmailTenant(req.Email, req.TenantID)
	if err != nil || totpSecret == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user or 2FA not set up"})
		return
	}
	if !totp.Validate(req.Code, totpSecret) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid code"})
		return
	}
	if !is2FAEnabled {
		_ = a.userStore.Set2FAEnabled(userID, true)
	}
	accessToken, _ := a.generateAccessToken(userID, req.TenantID, req.Email, role)
	refreshToken := generateRandomToken()
	refreshHash := hashRefreshToken(refreshToken)
	ctx := c.Request.Context()
	_ = a.sessionStore.SetRefresh(ctx, refreshHash, userID, req.TenantID, req.Email, refreshTokenDuration)

	c.JSON(200, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user_id":       userID,
		"expires_in":    int(accessTokenDuration.Seconds()),
	})
}

// loadEd25519Keys génère ou charge la paire Ed25519 utilisée pour signer
// les access tokens. Persistée sur disque dans le répertoire courant
// (private_ed25519.pem en PKCS8 mode 0600, public_ed25519.pem en PKIX mode 0644)
// pour rester partagée avec api-gateway via le volume Docker
// `./backend/auth-service:/app/keys:ro`.
//
// Migration : un sidecar de rotation (step-ca ou systemd timer) écrira
// les nouvelles paires en place et émettra un signal SIGHUP — Phase Z TODO.
func loadEd25519Keys() (ed25519.PrivateKey, ed25519.PublicKey) {
	privPath := "private_ed25519.pem"
	pubPath := "public_ed25519.pem"
	if _, err := os.Stat(privPath); err == nil {
		if privBytes, err := os.ReadFile(privPath); err == nil {
			if any, err := jwt.ParseEdPrivateKeyFromPEM(privBytes); err == nil {
				if priv, ok := any.(ed25519.PrivateKey); ok {
					pub, _ := priv.Public().(ed25519.PublicKey)
					return priv, pub
				}
			}
		}
	}
	log.Println("Ed25519 keys not found, generating new pair (will persist to disk)")
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		log.Fatal("ed25519 generate:", err)
	}
	if privDER, err := x509.MarshalPKCS8PrivateKey(priv); err == nil {
		block := &pem.Block{Type: "PRIVATE KEY", Bytes: privDER}
		_ = os.WriteFile(privPath, pem.EncodeToMemory(block), 0600)
	}
	if pubDER, err := x509.MarshalPKIXPublicKey(pub); err == nil {
		block := &pem.Block{Type: "PUBLIC KEY", Bytes: pubDER}
		_ = os.WriteFile(pubPath, pem.EncodeToMemory(block), 0644)
	}
	return priv, pub
}

func loadRSAKeys() (*rsa.PrivateKey, *rsa.PublicKey) {
	privPath := "private.pem"
	pubPath := "public.pem"
	if _, err := os.Stat(privPath); err == nil {
		privBytes, _ := os.ReadFile(privPath)
		pubBytes, _ := os.ReadFile(pubPath)
		priv, err1 := jwt.ParseRSAPrivateKeyFromPEM(privBytes)
		pub, err2 := jwt.ParseRSAPublicKeyFromPEM(pubBytes)
		if err1 == nil && err2 == nil {
			return priv, pub
		}
	}
	log.Println("RSA keys not found, using in-memory key for dev")
	priv, _ := rsa.GenerateKey(rand.Reader, 2048)
	pub := &priv.PublicKey
	// Écrire les deux clés pour que, au redémarrage, les mêmes clés soient rechargées (JWT restent valides).
	if der, err := x509.MarshalPKIXPublicKey(pub); err == nil {
		block := &pem.Block{Type: "PUBLIC KEY", Bytes: der}
		_ = os.WriteFile(pubPath, pem.EncodeToMemory(block), 0644)
	}
	privBlock := &pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(priv)}
	_ = os.WriteFile(privPath, pem.EncodeToMemory(privBlock), 0600)
	return priv, pub
}

func generateRandomToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
