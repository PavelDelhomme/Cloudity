package routes

import (
    "github.com/gin-gonic/gin"
    "github.com/PavelDelhomme/Cloudity/backend/auth-service/internal/handlers"
    "github.com/PavelDelhomme/Cloudity/backend/auth-service/internal/middleware"
    "github.com/PavelDelhomme/Cloudity/backend/auth-service/internal/services"
)

// SetupProtectedRoutes configure les routes protégées
func SetupProtectedRoutes(r *gin.Engine, authService services.AuthService, jwtService services.JWTService) {
    v1 := r.Group("/api/v1")
    v1.Use(middleware.ExtractTenant(authService))
    v1.Use(middleware.RequireAuth(jwtService))

    // Routes utilisateur authentifié
    auth := v1.Group("/auth")
    {
        authHandler := handlers.NewAuthHandler(authService)
        
        // Gestion du profil
        auth.GET("/me", authHandler.GetProfile)
        auth.PUT("/profile", authHandler.UpdateProfile)
        auth.POST("/change-password", authHandler.ChangePassword)
        
        // Gestion des sessions
        auth.POST("/logout", authHandler.Logout)
        auth.GET("/sessions", authHandler.GetSessions)
        auth.DELETE("/sessions/:sessionId", authHandler.RevokeSession)
        
        // 2FA
        auth.POST("/2fa/setup", authHandler.Setup2FA)
        auth.POST("/2fa/verify", authHandler.Verify2FA)
        auth.POST("/2fa/disable", authHandler.Disable2FA)
    }

    // Routes admin uniquement
    admin := v1.Group("/admin")
    admin.Use(middleware.RequireRole("admin"))
    {
        adminHandler := handlers.NewAdminHandler(authService)
        
        // Gestion des utilisateurs
        admin.GET("/users", adminHandler.ListUsers)
        admin.POST("/users", adminHandler.CreateUser)
        admin.PUT("/users/:userId", adminHandler.UpdateUser)
        admin.DELETE("/users/:userId", adminHandler.DeleteUser)
        admin.POST("/users/:userId/reset-password", adminHandler.ResetUserPassword)
        
        // Gestion du tenant
        admin.GET("/tenant", adminHandler.GetTenant)
        admin.PUT("/tenant", adminHandler.UpdateTenant)
        admin.GET("/tenant/stats", adminHandler.GetTenantStats)
        
        // Gestion des sessions
        admin.GET("/sessions", adminHandler.ListAllSessions)
        admin.DELETE("/sessions/:sessionId", adminHandler.RevokeSession)
        
        // Audit et logs
        admin.GET("/audit-logs", adminHandler.GetAuditLogs)
        admin.GET("/login-attempts", adminHandler.GetLoginAttempts)
    }
}
