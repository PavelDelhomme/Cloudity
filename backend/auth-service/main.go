package main

import (
	"crypto/rand"
	"crypto/rsa"
	"database/sql"
	"io/ioutil"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	db         *sql.DB
	redis      *redis.Client
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
}

type Claims struct {
	UserID   string `json:"user_id"`
	TenantID string `json:"tenant_id"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

func main() {
	godotenv.Load()

	// Database connection
	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Test database connection
	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}
	log.Println("✅ Database connected successfully")

	// Redis connection
	rdb := redis.NewClient(&redis.Options{
		Addr:     "redis:6379",
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       0,
	})

	// Load RSA keys
	privateKey, publicKey := loadRSAKeys()

	authService := &AuthService{
		db:         db,
		redis:      rdb,
		privateKey: privateKey,
		publicKey:  publicKey,
	}

	r := gin.Default()

	// PAS DE CORS ICI - géré par l'API Gateway uniquement

	// Routes
	auth := r.Group("/api/v1/auth")
	{
		auth.POST("/register", authService.Register)
		auth.POST("/login", authService.Login)
		auth.POST("/refresh", authService.RefreshToken)
		auth.GET("/validate", authService.ValidateToken)
		auth.GET("/profile", authService.GetProfile)
	}

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":    "healthy",
			"service":   "auth-service",
			"timestamp": time.Now().UTC(),
		})
	})

	log.Println("🚀 Auth Service starting on port 8081...")
	if err := r.Run(":8081"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func loadRSAKeys() (*rsa.PrivateKey, *rsa.PublicKey) {
	// Essayer de charger depuis les fichiers
	if privateKeyData, err := ioutil.ReadFile("private.pem"); err == nil {
		if privateKey, err := jwt.ParseRSAPrivateKeyFromPEM(privateKeyData); err == nil {
			if publicKeyData, err := ioutil.ReadFile("public.pem"); err == nil {
				if publicKey, err := jwt.ParseRSAPublicKeyFromPEM(publicKeyData); err == nil {
					log.Println("✅ RSA keys loaded from files")
					return privateKey, publicKey
				}
			}
		}
	}

	// Générer des clés temporaires si fichiers non trouvés ddepuis fichiers
	log.Println("⚠️ Generating temporary RSA keys...")
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal("Failed to generate RSA keys:", err)
	}

	return privateKey, &privateKey.PublicKey
}

func (a *AuthService) Register(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required,min=8"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Récupérer tenant ID depuis header - GÉRER "admin" comme UUID
	tenantIDHeader := c.GetHeader("X-Tenant-ID")
	if tenantIDHeader == "" {
		c.JSON(400, gin.H{"error": "X-Tenant-ID header required"})
		return
	}

	// Convertir "admin" en UUID du tenant admin
	var tenantID string
	if tenantIDHeader == "admin" {
		err := a.db.QueryRow("SELECT id FROM tenants WHERE subdomain = 'admin' OR name = 'Admin Tenant' LIMIT 1").Scan(&tenantID)
		if err != nil {
			c.JSON(400, gin.H{"error": "Admin tenant not found"})
			return
		}
	} else {
		tenantID = tenantIDHeader
	}

	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(req.Password), 12)

	var userID string
	err := a.db.QueryRow(`
		INSERT INTO users (email, password_hash, tenant_id, is_active, created_at)
		VALUES ($1, $2, $3, true, NOW())
		RETURNING id
	`, req.Email, string(hashedPassword), tenantID).Scan(&userID)

	if err != nil {
		log.Printf("Register error: %v", err)
		c.JSON(500, gin.H{"error": "Failed to create user"})
		return
	}

	token, _ := a.generateToken(userID, tenantID, req.Email)
	c.JSON(201, gin.H{
		"access_token": token,
		"user_id":      userID,
		"message":      "User registered successfully",
	})
}

func (a *AuthService) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Récupérer tenant ID depuis header - GÉRER "admin" comme UUID
	tenantIDHeader := c.GetHeader("X-Tenant-ID")
	if tenantIDHeader == "" {
		c.JSON(400, gin.H{"error": "X-Tenant-ID header required"})
		return
	}

	// Convertir "admin" en UUID du tenant admin
	var tenantID string
	if tenantIDHeader == "admin" {
		err := a.db.QueryRow("SELECT id FROM tenants WHERE subdomain = 'admin' OR name = 'Admin Tenant' LIMIT 1").Scan(&tenantID)
		if err != nil {
			c.JSON(400, gin.H{"error": "Admin tenant not found"})
			return
		}
	} else {
		tenantID = tenantIDHeader
	}

	// Chercher l'utilisateur
	var userID, hashedPassword string
	err := a.db.QueryRow(`
		SELECT id, password_hash
		FROM users
		WHERE email = $1 AND tenant_id = $2 AND is_active = true
	`, req.Email, tenantID).Scan(&userID, &hashedPassword)

	if err != nil {
		log.Printf("Login error - user not found: %v", err)
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	// Vérifier mot de passe
	if err := bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.Password)); err != nil {
		log.Printf("Login error - password mismatch: %v", err)
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	// Générer tokens
	accessToken, _ := a.generateToken(userID, tenantID, req.Email)
	refreshToken, _ := a.generateRefreshToken(userID, tenantID, req.Email)

	c.JSON(200, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"token_type":    "Bearer",
		"expires_in":    3600,
		"user_id":       userID,
		"user": gin.H{
			"id":        userID,
			"email":     req.Email,
			"tenant_id": tenantID,
			"role":      "admin", // Pour l'admin
		},
	})
}

func (a *AuthService) generateToken(userID, tenantID, email string) (string, error) {
	claims := Claims{
		UserID:   userID,
		TenantID: tenantID,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(a.privateKey)
}

func (a *AuthService) generateRefreshToken(userID, tenantID, email string) (string, error) {
	claims := Claims{
		UserID:   userID,
		TenantID: tenantID,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(a.privateKey)
}

func (a *AuthService) RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Valider refresh token
	token, err := jwt.ParseWithClaims(req.RefreshToken, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return a.publicKey, nil
	})

	if err != nil || !token.Valid {
		c.JSON(401, gin.H{"error": "Invalid refresh token"})
		return
	}

	claims := token.Claims.(*Claims)

	// Générer nouveaux tokens
	newAccessToken, _ := a.generateToken(claims.UserID, claims.TenantID, claims.Email)
	newRefreshToken, _ := a.generateRefreshToken(claims.UserID, claims.TenantID, claims.Email)

	c.JSON(200, gin.H{
		"access_token":  newAccessToken,
		"refresh_token": newRefreshToken,
		"token_type":    "Bearer",
		"expires_in":    3600,
	})
}

func (a *AuthService) ValidateToken(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(401, gin.H{"error": "Authorization header required"})
		return
	}

	// Extraire token
	tokenString := authHeader
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		tokenString = authHeader[7:]
	}

	// Valider token
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return a.publicKey, nil
	})

	if err != nil || !token.Valid {
		c.JSON(401, gin.H{"error": "Invalid token"})
		return
	}

	claims := token.Claims.(*Claims)
	c.JSON(200, gin.H{
		"valid":     true,
		"user_id":   claims.UserID,
		"tenant_id": claims.TenantID,
		"email":     claims.Email,
	})
}

func (a *AuthService) GetProfile(c *gin.Context) {
	c.JSON(200, gin.H{
		"message": "Profile endpoint - implement token validation",
	})
}
