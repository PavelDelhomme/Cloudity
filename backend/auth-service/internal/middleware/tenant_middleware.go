package middleware

import (
    "net/http"
    "strings"
    
    "github.com/gin-gonic/gin"
    "github.com/PavelDelhomme/Cloudity/services/auth-service/auth"
    "github.com/google/uuid"
)

// ExtractTenant middleware pour extraire le tenant depuis le header ou subdomain
func ExtractTenant(authService auth.AuthService) gin.HandlerFunc {
    return func(c *gin.Context) {
        var tenantID uuid.UUID
        var err error
        
        // Option 1: Header X-Tenant-ID
        if tenantHeader := c.GetHeader("X-Tenant-ID"); tenantHeader != "" {
            tenantID, err = uuid.Parse(tenantHeader)
            if err != nil {
                c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid tenant ID format"})
                c.Abort()
                return
            }
        } else {
            // Option 2: Subdomain (admin.cloudity.local -> admin)
            host := c.GetHeader("Host")
            if host == "" {
                c.JSON(http.StatusBadRequest, gin.H{"error": "Host header required"})
                c.Abort()
                return
            }
            
            subdomain := extractSubdomain(host)
            if subdomain == "" {
                c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid subdomain"})
                c.Abort()
                return
            }
            
            // Résoudre le tenant par subdomain
            tenant, err := authService.ResolveTenant(c.Request.Context(), subdomain)
            if err != nil {
                c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to resolve tenant"})
                c.Abort()
                return
            }
            if tenant == nil {
                c.JSON(http.StatusNotFound, gin.H{"error": "Tenant not found"})
                c.Abort()
                return
            }
            
            tenantID = tenant.TenantID
        }
        
        // Stocker le tenant ID dans le context
        c.Set("tenant_id", tenantID)
        c.Next()
    }
}

func extractSubdomain(host string) string {
    // Supprimer le port s'il y en a un
    if strings.Contains(host, ":") {
        host = strings.Split(host, ":")[0]
    }
    
    parts := strings.Split(host, ".")
    if len(parts) >= 2 {
        return parts[0]
    }
    return ""
}
