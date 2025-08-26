package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/joho/godotenv/autoload"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	r := gin.Default()

	// Route de santé
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":    "healthy",
			"service":   "auth-service",
			"timestamp": time.Now().UTC(),
		})
	})

	// Routes d'authentification basiques
	r.POST("/auth/login", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Login endpoint",
			"status":  "not implemented yet",
		})
	})

	r.POST("/auth/register", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Register endpoint",
			"status":  "not implemented yet",
		})
	})

	r.GET("/auth/verify", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"message": "Verify endpoint",
			"status":  "not implemented yet",
		})
	})

	log.Printf("Auth Service starting on port %s", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}
