package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"database/sql"
	"encoding/hex"
	"encoding/pem"
	"log"
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
	"github.com/pquerna/otp/totp"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

// accessTokenDuration est fixé au démarrage (voir init) : défaut 60 min, surcharge ACCESS_TOKEN_DURATION_MINUTES (5–1440).
var accessTokenDuration time.Duration

const refreshTokenDuration = 30 * 24 * time.Hour // 30 jours : session longue, sécurisée par rotation à chaque refresh

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
	GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret string, is2FAEnabled bool, err error)
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
	privateKey   *rsa.PrivateKey
	publicKey    *rsa.PublicKey
	useArgon     bool // true = Argon2id, false = bcrypt (rétrocompat)
}

type Claims struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

func main() {
	godotenv.Load()

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	rdb := redis.NewClient(&redis.Options{
		Addr:     os.Getenv("REDIS_URL"),
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
	})

	privateKey, publicKey := loadRSAKeys()

	authService := &AuthService{
		userStore:    &postgresUserStore{db: db},
		sessionStore: &redisSessionStore{rdb: rdb},
		privateKey:   privateKey,
		publicKey:    publicKey,
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

	log.Println("Auth Service starting on port 8081...")
	r.Run(":8081")
}

// --- Password hashing (Argon2id ou bcrypt pour rétrocompat) ---

func (a *AuthService) hashPassword(password string) (string, error) {
	if a.useArgon {
		return argon2id.CreateHash(password, argon2id.DefaultParams)
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

func (p *postgresUserStore) GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret string, is2FAEnabled bool, err error) {
	err = p.db.QueryRow(`
		SELECT id::text, password_hash, COALESCE(totp_secret,''), is_2fa_enabled
		FROM users WHERE email = $1 AND tenant_id::text = $2 AND is_active = true
	`, email, tenantID).Scan(&userID, &passwordHash, &totpSecret, &is2FAEnabled)
	if err != nil {
		return "", "", "", false, err
	}
	return userID, passwordHash, totpSecret, is2FAEnabled, nil
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

func (a *AuthService) generateAccessToken(userID, tenantID, email string) (string, error) {
	claims := Claims{
		UserID:   userID,
		TenantID: tenantID,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(accessTokenDuration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(a.privateKey)
}

func (a *AuthService) parseAccessToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		return a.publicKey, nil
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
			c.JSON(http.StatusConflict, gin.H{"error": "email already registered for this tenant"})
			return
		}
		c.JSON(500, gin.H{"error": "Failed to create user"})
		return
	}

	accessToken, _ := a.generateAccessToken(userID, req.TenantID, req.Email)
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

	userID, passwordHash, _, is2FAEnabled, err := a.userStore.GetUserByEmailTenant(req.Email, req.TenantID)
	if err == sql.ErrNoRows || err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if !a.comparePassword(req.Password, passwordHash) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if is2FAEnabled {
		c.JSON(200, gin.H{
			"requires_2fa": true,
			"user_id":      userID,
			"temp_token":   "", // en production on pourrait émettre un token court pour l'étape 2FA
		})
		return
	}

	accessToken, _ := a.generateAccessToken(userID, req.TenantID, req.Email)
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

	accessToken, _ := a.generateAccessToken(userID, tenantID, email)
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
	userID, _, totpSecret, is2FAEnabled, err := a.userStore.GetUserByEmailTenant(req.Email, req.TenantID)
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
	accessToken, _ := a.generateAccessToken(userID, req.TenantID, req.Email)
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
