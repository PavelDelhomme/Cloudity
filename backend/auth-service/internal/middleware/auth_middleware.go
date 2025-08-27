package middleware

import (
    "net/http"
    "strings"
    
    "github.com/gin-gonic/gin"
    "github.com/PavelDelhomme/Cloudity/services/auth-service/auth"
    "github.com/google/uuid"
)

// RequireAuth middleware pour vérifier l'authentification
func RequireAuth(jwtService auth.JWTService) gin.HandlerFunc {
    return func(c *gin.Context) {
        authHeader := c.GetHeader("Authorization")
        if authHeader == "" {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header required"})
            c.Abort()
            return
        }
        
        // Vérifier le format "Bearer token"
        tokenParts := strings.Split(authHeader, "Bearer ")
        if len(tokenParts) != 2 {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid authorization header format"})
            c.Abort()
            return
        }
        
        token := tokenParts[1]
        claims, err := jwtService.ValidateAccessToken(token)
        if err != nil {
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
            c.Abort()
            return
        }
        
        // Vérifier que le tenant correspond
        tenantID, exists := c.Get("tenant_id")
        if exists && tenantID != claims.TenantID {
            c.JSON(http.StatusForbidden, gin.H{"error": "Token tenant mismatch"})
            c.Abort()
            return
        }
        
        // Stocker les informations utilisateur dans le context
        c.Set("user_id", claims.UserID)
        c.Set("tenant_id", claims.TenantID)
        c.Set("user_email", claims.Email)
        c.Set("user_role", claims.Role)
        
        c.Next()
    }
}

// RequireRole middleware pour vérifier le rôle
func RequireRole(role string) gin.HandlerFunc {
    return func(c *gin.Context) {
        userRole, exists := c.Get("user_role")
        if !exists || userRole != role {
            c.JSON(http.StatusForbidden, gin.H{"error": "Insufficient privileges"})
            c.Abort()
            return
        }
        c.Next()
    }
}
