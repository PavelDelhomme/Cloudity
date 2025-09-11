package main

import (
	"crypto/rand"
	"crypto/rsa"
	"database/sql"
	"log"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	db         *sql.DB
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

	db, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}
	log.Println("✅ Database connected successfully")

	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		log.Fatal("Failed to generate RSA keys:", err)
	}
	log.Println("⚠️ Generating temporary RSA keys...")

	authService := &AuthService{
		db:         db,
		privateKey: privateKey,
		publicKey:  &privateKey.PublicKey,
	}

	r := gin.Default()

	auth := r.Group("/api/v1/auth")
	{
		auth.POST("/login", authService.Login)
		auth.POST("/register", authService.Register)
	}

	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "service": "auth-service"})
	})

	log.Println("🚀 Auth Service starting on port 8081...")
	r.Run(":8081")
}

func (a *AuthService) Login(c *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("❌ Bind error: %v", err)
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	log.Printf("🔍 Login attempt - Email: %s", req.Email)

	tenantIDHeader := c.GetHeader("X-Tenant-ID")
	log.Printf("🏢 Tenant header: %s", tenantIDHeader)

	// Convertir "admin" en UUID tenant
	var tenantID string
	if tenantIDHeader == "admin" {
		err := a.db.QueryRow("SELECT id FROM tenants WHERE subdomain = 'admin' LIMIT 1").Scan(&tenantID)
		if err != nil {
			log.Printf("❌ Tenant lookup error: %v", err)
			c.JSON(400, gin.H{"error": "Admin tenant not found"})
			return
		}
		log.Printf("✅ Admin tenant UUID: %s", tenantID)
	} else {
		tenantID = tenantIDHeader
	}

	// Chercher l'utilisateur
	var userID, hashedPassword string
	query := "SELECT id, password_hash FROM users WHERE email = $1 AND tenant_id = $2 AND is_active = true"
	err := a.db.QueryRow(query, req.Email, tenantID).Scan(&userID, &hashedPassword)
	if err != nil {
		log.Printf("❌ User lookup error: %v", err)
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	log.Printf("✅ User found - ID: %s", userID)
	log.Printf("🔑 Hash preview: %s...", hashedPassword[:20])

	// Vérifier mot de passe
	err = bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(req.Password))
	if err != nil {
		log.Printf("❌ Password check failed: %v", err)
		c.JSON(401, gin.H{"error": "Invalid credentials"})
		return
	}

	log.Printf("🎉 Login successful for: %s", req.Email)

	// Générer token simple
	accessToken, _ := a.generateToken(userID, tenantID, req.Email)

	c.JSON(200, gin.H{
		"access_token": accessToken,
		"user_id":      userID,
		"user": gin.H{
			"id":    userID,
			"email": req.Email,
			"role":  "admin",
		},
		"message": "Login successful",
	})
}

func (a *AuthService) Register(c *gin.Context) {
	c.JSON(200, gin.H{"message": "Register endpoint"})
}

func (a *AuthService) generateToken(userID, tenantID, email string) (string, error) {
	claims := Claims{
		UserID:   userID,
		TenantID: tenantID,
		Email:    email,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(a.privateKey)
}
