package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"

)



// Main application
func main() {
	config := Config{
		DatabaseURL: getEnv("DATABASE_URL", "postgresql://cloudity_admin:cloudity_secure_2024@localhost:5432/cloudity_production"),
		JWTSecret:   getEnv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production-2024"),
		Port:        getEnv("PORT", "8080"),
	}

	// Initialiser la base de données
	db, err := NewDatabase(config.DatabaseURL)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	// Initialiser les services
	authRepo := NewAuthRepository(db)
	authService := NewAuthService(authRepo, config.JWTSecret)
	authController := NewAuthController(authService, db)

	// Configurer Gin
	r := gin.Default()

	// Middleware CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.Status(200)
			return
		}

		c.Next()
	})

	// Routes publiques
	public := r.Group("/api/v1")
	{
		public.POST("/auth/login", authController.Login)
		public.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "healthy", "timestamp": time.Now()})
		})
	}

	// Routes protégées
	protected := r.Group("/api/v1")
	protected.Use(AuthMiddleware(config.JWTSecret, db))
	{
		protected.GET("/users", authController.GetUsers)
		protected.GET("/me", func(c *gin.Context) {
			userID := c.GetString("user_id")
			tenantID := c.GetString("tenant_id")
			role := c.GetString("role")

			c.JSON(200, gin.H{
				"user_id":   userID,
				"tenant_id": tenantID,
				"role":      role,
			})
		})
	}

	log.Printf("🚀 CLOUDITY Auth Service starting on port %s", config.Port)
	log.Fatal(r.Run(":" + config.Port))
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}