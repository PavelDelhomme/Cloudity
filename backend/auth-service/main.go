package main

import (
	"crypto/rsa"
	"database/sql"
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

	// Redis connection
	rdb := redis.NewClient(&redis.Options{
		Addr:     os.Getenv("REDIS_URL"),
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

	// Routes
	r.POST("/auth/register", authService.Register)
	r.POST("/auth/login", authService.Login)
	r.POST("/auth/refresh", authService.RefreshToken)
	r.POST("/auth/2fa/enable", authService.Enable2FA)
	r.POST("/auth/2fa/verify", authService.Verify2FA)
	r.GET("/auth/validate", authService.ValidateToken)
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy"})
	})

	log.Println("Auth Service starting on port 8081...")
	r.Run(":8081")
}

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

	hashedPassword, _ := bcrypt.GenerateFromPassword([]byte(req.Password), 12)

	var userID string
	err := a.db.QueryRow(`
        INSERT INTO users (email, password_hash, tenant_id)
        VALUES ($1, $2, $3)
        RETURNING id
    `, req.Email, string(hashedPassword), req.TenantID).Scan(&userID)

	if err != nil {
		c.JSON(500, gin.H{"error": "Failed to create user"})
		return
	}

	token, _ := a.generateToken(userID, req.TenantID, req.Email)
	c.JSON(201, gin.H{"token": token, "user_id": userID})
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
