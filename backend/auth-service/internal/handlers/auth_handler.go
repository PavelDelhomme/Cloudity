package handlers

import (
    "net"
    "net/http"
    
    "github.com/gin-gonic/gin"
    "github.com/PavelDelhomme/Cloudity/services/auth-service/auth"
    "github.com/google/uuid"
)

type AuthHandler struct {
    authService auth.AuthService
}

func NewAuthHandler(authService auth.AuthService) *AuthHandler {
    return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Register(c *gin.Context) {
    var req auth.RegisterRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    // Récupérer le tenant ID depuis le context (middleware)
    if tenantID, exists := c.Get("tenant_id"); exists {
        req.TenantID = tenantID.(uuid.UUID)
    }
    
    response, err := h.authService.Register(c.Request.Context(), req)
    if err != nil {
        switch err {
        case auth.ErrUserAlreadyExists:
            c.JSON(http.StatusConflict, gin.H{"error": "User already exists"})
        case auth.ErrTenantNotFound:
            c.JSON(http.StatusNotFound, gin.H{"error": "Tenant not found"})
        case auth.ErrTenantInactive:
            c.JSON(http.StatusForbidden, gin.H{"error": "Tenant is inactive"})
        case auth.ErrMaxUsersReached:
            c.JSON(http.StatusForbidden, gin.H{"error": "Maximum users reached"})
        default:
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Registration failed"})
        }
        return
    }
    
    c.JSON(http.StatusCreated, response)
}

func (h *AuthHandler) Login(c *gin.Context) {
    var req auth.LoginRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    // Récupérer le tenant ID depuis le context (middleware)
    if tenantID, exists := c.Get("tenant_id"); exists {
        req.TenantID = tenantID.(uuid.UUID)
    }
    
    // Récupérer IP et User-Agent
    if ip := net.ParseIP(c.ClientIP()); ip != nil {
        req.IPAddress = &ip
    }
    if userAgent := c.GetHeader("User-Agent"); userAgent != "" {
        req.UserAgent = &userAgent
    }
    
    response, err := h.authService.Login(c.Request.Context(), req)
    if err != nil {
        switch err {
        case auth.ErrInvalidCredentials:
            c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
        case auth.ErrTenantNotFound:
            c.JSON(http.StatusNotFound, gin.H{"error": "Tenant not found"})
        case auth.ErrTenantInactive:
            c.JSON(http.StatusForbidden, gin.H{"error": "Tenant is inactive"})
        case auth.ErrUserInactive:
            c.JSON(http.StatusForbidden, gin.H{"error": "User is inactive"})
        default:
            c.JSON(http.StatusInternalServerError, gin.H{"error": "Login failed"})
        }
        return
    }
    
    c.JSON(http.StatusOK, response)
}

func (h *AuthHandler) RefreshToken(c *gin.Context) {
    var req auth.RefreshTokenRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    response, err := h.authService.RefreshToken(c.Request.Context(), req)
    if err != nil {
        c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, response)
}

func (h *AuthHandler) Logout(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
        return
    }
    
    // TODO: Récupérer le session ID depuis le token ou header
    sessionID := uuid.New() // Placeholder
    
    err := h.authService.Logout(c.Request.Context(), userID.(uuid.UUID), sessionID)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Logout failed"})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{"message": "Logged out successfully"})
}

func (h *AuthHandler) GetProfile(c *gin.Context) {
    userID, exists := c.Get("user_id")
    if !exists {
        c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
        return
    }
    
    user, err := h.authService.GetProfile(c.Request.Context(), userID.(uuid.UUID))
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get profile"})
        return
    }
    
    if user == nil {
        c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
        return
    }
    
    c.JSON(http.StatusOK, user)
}
