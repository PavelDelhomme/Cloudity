package routes

import (
    "github.com/gin-gonic/gin"
    "github.com/PavelDelhomme/Cloudity/backend/auth-service/internal/handlers"
    "github.com/PavelDelhomme/Cloudity/backend/auth-service/internal/middleware"
    "github.com/PavelDelhomme/Cloudity/backend/auth-service/internal/services"
)

// SetupPublicRoutes configure les routes publiques
func SetupPublicRoutes(r *gin.Engine, authService services.AuthService) {
    // Health checks
    r.GET("/health", handlers.HealthCheck)
    r.GET("/ready", handlers.ReadinessCheck)

    // API v1 avec middleware tenant
    v1 := r.Group("/api/v1")
    v1.Use(middleware.ExtractTenant(authService))
    
    // Routes publiques d'authentification
    auth := v1.Group("/auth")
    {
        authHandler := handlers.NewAuthHandler(authService)
        
        // Authentification de base
        auth.POST("/register", authHandler.Register)
        auth.POST("/login", authHandler.Login)
        auth.POST("/refresh", authHandler.RefreshToken)
        
        // Récupération de mot de passe
        auth.POST("/forgot-password", authHandler.ForgotPassword)
        auth.POST("/reset-password", authHandler.ResetPassword)
        
        // Vérification email
        auth.GET("/verify-email/:token", authHandler.VerifyEmail)
        
        // Information publique
        auth.GET("/tenants/:subdomain", authHandler.GetTenantInfo)
    }
}
