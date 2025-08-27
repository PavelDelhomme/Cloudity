package auth

import (
    "errors"
    "time"
    
    "github.com/golang-jwt/jwt/v5"
    "github.com/google/uuid"
    "github.com/PavelDelhomme/Cloudity/services/auth-service/models"
)

type JWTService interface {
    GenerateAccessToken(user *models.User) (string, error)
    GenerateRefreshToken(user *models.User) (string, error)
    ValidateAccessToken(tokenString string) (*JWTClaims, error)
    ValidateRefreshToken(tokenString string) (*JWTClaims, error)
}

type JWTClaims struct {
    UserID   uuid.UUID `json:"user_id"`
    TenantID uuid.UUID `json:"tenant_id"`
    Email    string    `json:"email"`
    Role     string    `json:"role"`
    jwt.RegisteredClaims
}

type jwtService struct {
    secretKey             []byte
    accessTokenDuration   time.Duration
    refreshTokenDuration  time.Duration
}

func NewJWTService(secretKey string, accessTokenDuration, refreshTokenDuration time.Duration) JWTService {
    return &jwtService{
        secretKey:            []byte(secretKey),
        accessTokenDuration:  accessTokenDuration,
        refreshTokenDuration: refreshTokenDuration,
    }
}

func (s *jwtService) GenerateAccessToken(user *models.User) (string, error) {
    claims := &JWTClaims{
        UserID:   user.UserID,
        TenantID: user.TenantID,
        Email:    user.Email,
        Role:     user.Role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.accessTokenDuration)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
            Issuer:    "cloudity-auth-service",
            Subject:   user.UserID.String(),
            ID:        uuid.New().String(),
        },
    }
    
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(s.secretKey)
}

func (s *jwtService) GenerateRefreshToken(user *models.User) (string, error) {
    claims := &JWTClaims{
        UserID:   user.UserID,
        TenantID: user.TenantID,
        Email:    user.Email,
        Role:     user.Role,
        RegisteredClaims: jwt.RegisteredClaims{
            ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.refreshTokenDuration)),
            IssuedAt:  jwt.NewNumericDate(time.Now()),
            NotBefore: jwt.NewNumericDate(time.Now()),
            Issuer:    "cloudity-auth-service",
            Subject:   user.UserID.String(),
            ID:        uuid.New().String(),
        },
    }
    
    token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
    return token.SignedString(s.secretKey)
}

func (s *jwtService) ValidateAccessToken(tokenString string) (*JWTClaims, error) {
    return s.validateToken(tokenString)
}

func (s *jwtService) ValidateRefreshToken(tokenString string) (*JWTClaims, error) {
    return s.validateToken(tokenString)
}

func (s *jwtService) validateToken(tokenString string) (*JWTClaims, error) {
    claims := &JWTClaims{}
    
    token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
        if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
            return nil, errors.New("unexpected signing method")
        }
        return s.secretKey, nil
    })
    
    if err != nil {
        return nil, err
    }
    
    if !token.Valid {
        return nil, errors.New("invalid token")
    }
    
    return claims, nil
}
