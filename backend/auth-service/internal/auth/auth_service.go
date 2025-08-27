package auth

import (
    "context"
    "errors"
    "fmt"
    "net"
    "time"
    
    "github.com/PavelDelhomme/Cloudity/services/auth-service/models"
    "github.com/PavelDelhomme/Cloudity/services/auth-service/repository"
    "github.com/google/uuid"
    "golang.org/x/crypto/bcrypt"
)

var (
    ErrInvalidCredentials = errors.New("invalid credentials")
    ErrUserNotFound      = errors.New("user not found")
    ErrUserAlreadyExists = errors.New("user already exists")
    ErrTenantNotFound    = errors.New("tenant not found")
    ErrTenantInactive    = errors.New("tenant is inactive")
    ErrUserInactive      = errors.New("user is inactive")
    ErrMaxUsersReached   = errors.New("maximum users reached for tenant")
)

type AuthService interface {
    Register(ctx context.Context, req RegisterRequest) (*AuthResponse, error)
    Login(ctx context.Context, req LoginRequest) (*AuthResponse, error)
    RefreshToken(ctx context.Context, req RefreshTokenRequest) (*AuthResponse, error)
    Logout(ctx context.Context, userID uuid.UUID, sessionID uuid.UUID) error
    GetProfile(ctx context.Context, userID uuid.UUID) (*models.User, error)
    ResolveTenant(ctx context.Context, identifier string) (*models.Tenant, error)
}

type RegisterRequest struct {
    TenantID  uuid.UUID `json:"tenant_id" validate:"required"`
    Email     string    `json:"email" validate:"required,email"`
    Password  string    `json:"password" validate:"required,min=8"`
    FirstName *string   `json:"first_name" validate:"omitempty,min=1,max=100"`
    LastName  *string   `json:"last_name" validate:"omitempty,min=1,max=100"`
}

type LoginRequest struct {
    TenantID  uuid.UUID `json:"tenant_id" validate:"required"`
    Email     string    `json:"email" validate:"required,email"`
    Password  string    `json:"password" validate:"required"`
    IPAddress *net.IP   `json:"-"`
    UserAgent *string   `json:"-"`
}

type RefreshTokenRequest struct {
    RefreshToken string `json:"refresh_token" validate:"required"`
}

type AuthResponse struct {
    AccessToken  string      `json:"access_token"`
    RefreshToken string      `json:"refresh_token"`
    TokenType    string      `json:"token_type"`
    ExpiresIn    int         `json:"expires_in"`
    User         *models.User `json:"user"`
}

type authService struct {
    userRepo    repository.UserRepository
    tenantRepo  repository.TenantRepository
    sessionRepo repository.SessionRepository
    jwtService  JWTService
}

func NewAuthService(
    userRepo repository.UserRepository,
    tenantRepo repository.TenantRepository,
    sessionRepo repository.SessionRepository,
    jwtService JWTService,
) AuthService {
    return &authService{
        userRepo:    userRepo,
        tenantRepo:  tenantRepo,
        sessionRepo: sessionRepo,
        jwtService:  jwtService,
    }
}

func (s *authService) Register(ctx context.Context, req RegisterRequest) (*AuthResponse, error) {
    // Vérifier que le tenant existe et est actif
    tenant, err := s.tenantRepo.GetByID(ctx, req.TenantID)
    if err != nil {
        return nil, err
    }
    if tenant == nil {
        return nil, ErrTenantNotFound
    }
    if !tenant.IsActive() {
        return nil, ErrTenantInactive
    }
    
    // Vérifier le nombre maximum d'utilisateurs
    userCount, err := s.userRepo.CountByTenant(ctx, req.TenantID)
    if err != nil {
        return nil, err
    }
    if userCount >= int64(tenant.MaxUsers) {
        return nil, ErrMaxUsersReached
    }
    
    // Vérifier que l'utilisateur n'existe pas déjà
    existingUser, err := s.userRepo.GetByEmailAndTenant(ctx, req.Email, req.TenantID)
    if err != nil {
        return nil, err
    }
    if existingUser != nil {
        return nil, ErrUserAlreadyExists
    }
    
    // Créer le nouvel utilisateur
    user := &models.User{
        TenantID:  req.TenantID,
        Email:     req.Email,
        FirstName: req.FirstName,
        LastName:  req.LastName,
        Role:      "user",
        IsActive:  true,
    }
    
    // Hash du mot de passe
    if err := user.SetPassword(req.Password); err != nil {
        return nil, err
    }
    
    // Sauvegarder en base
    if err := s.userRepo.Create(ctx, user); err != nil {
        return nil, err
    }
    
    // Générer les tokens
    accessToken, err := s.jwtService.GenerateAccessToken(user)
    if err != nil {
        return nil, err
    }
    
    refreshToken, err := s.jwtService.GenerateRefreshToken(user)
    if err != nil {
        return nil, err
    }
    
    // Créer la session
    session := &models.UserSession{
        UserID:           user.UserID,
        TenantID:         user.TenantID,
        RefreshTokenHash: s.hashRefreshToken(refreshToken),
        ExpiresAt:        time.Now().Add(7 * 24 * time.Hour), // 7 jours
    }
    
    if err := s.sessionRepo.Create(ctx, session); err != nil {
        return nil, err
    }
    
    return &AuthResponse{
        AccessToken:  accessToken,
        RefreshToken: refreshToken,
        TokenType:    "Bearer",
        ExpiresIn:    3600, // 1 heure
        User:         user,
    }, nil
}

func (s *authService) Login(ctx context.Context, req LoginRequest) (*AuthResponse, error) {
    // Vérifier que le tenant existe et est actif
    tenant, err := s.tenantRepo.GetByID(ctx, req.TenantID)
    if err != nil {
        return nil, err
    }
    if tenant == nil {
        return nil, ErrTenantNotFound
    }
    if !tenant.IsActive() {
        return nil, ErrTenantInactive
    }
    
    // Trouver l'utilisateur
    user, err := s.userRepo.GetByEmailAndTenant(ctx, req.Email, req.TenantID)
    if err != nil {
        return nil, err
    }
    if user == nil {
        return nil, ErrInvalidCredentials
    }
    
    // Vérifier que l'utilisateur est actif
    if !user.IsActive {
        return nil, ErrUserInactive
    }
    
    // Vérifier le mot de passe
    if !user.CheckPassword(req.Password) {
        return nil, ErrInvalidCredentials
    }
    
    // Mettre à jour le timestamp de dernière connexion
    now := time.Now()
    user.LastLogin = &now
    if err := s.userRepo.Update(ctx, user); err != nil {
        return nil, err
    }
    
    // Générer les tokens
    accessToken, err := s.jwtService.GenerateAccessToken(user)
    if err != nil {
        return nil, err
    }
    
    refreshToken, err := s.jwtService.GenerateRefreshToken(user)
    if err != nil {
        return nil, err
    }
    
    // Créer la session
    session := &models.UserSession{
        UserID:           user.UserID,
        TenantID:         user.TenantID,
        RefreshTokenHash: s.hashRefreshToken(refreshToken),
        IPAddress:        req.IPAddress,
        UserAgent:        req.UserAgent,
        ExpiresAt:        time.Now().Add(7 * 24 * time.Hour), // 7 jours
    }
    
    if err := s.sessionRepo.Create(ctx, session); err != nil {
        return nil, err
    }
    
    return &AuthResponse{
        AccessToken:  accessToken,
        RefreshToken: refreshToken,
        TokenType:    "Bearer",
        ExpiresIn:    3600, // 1 heure
        User:         user,
    }, nil
}

func (s *authService) RefreshToken(ctx context.Context, req RefreshTokenRequest) (*AuthResponse, error) {
    // Valider le refresh token
    claims, err := s.jwtService.ValidateRefreshToken(req.RefreshToken)
    if err != nil {
        return nil, errors.New("invalid refresh token")
    }
    
    // Vérifier la session
    session, err := s.sessionRepo.GetByUserIDAndTokenHash(ctx, claims.UserID, s.hashRefreshToken(req.RefreshToken))
    if err != nil {
        return nil, err
    }
    if session == nil || session.IsExpired() {
        return nil, errors.New("session expired")
    }
    
    // Récupérer l'utilisateur
    user, err := s.userRepo.GetByID(ctx, claims.UserID)
    if err != nil {
        return nil, err
    }
    if user == nil || !user.IsActive {
        return nil, ErrUserInactive
    }
    
    // Générer de nouveaux tokens
    accessToken, err := s.jwtService.GenerateAccessToken(user)
    if err != nil {
        return nil, err
    }
    
    newRefreshToken, err := s.jwtService.GenerateRefreshToken(user)
    if err != nil {
        return nil, err
    }
    
    // Mettre à jour la session
    session.RefreshTokenHash = s.hashRefreshToken(newRefreshToken)
    session.UpdateLastUsed()
    if err := s.sessionRepo.Update(ctx, session); err != nil {
        return nil, err
    }
    
    return &AuthResponse{
        AccessToken:  accessToken,
        RefreshToken: newRefreshToken,
        TokenType:    "Bearer",
        ExpiresIn:    3600, // 1 heure
        User:         user,
    }, nil
}

func (s *authService) Logout(ctx context.Context, userID uuid.UUID, sessionID uuid.UUID) error {
    return s.sessionRepo.DeleteByUserAndSession(ctx, userID, sessionID)
}

func (s *authService) GetProfile(ctx context.Context, userID uuid.UUID) (*models.User, error) {
    return s.userRepo.GetByID(ctx, userID)
}

func (s *authService) ResolveTenant(ctx context.Context, identifier string) (*models.Tenant, error) {
    // Essayer par subdomain d'abord
    tenant, err := s.tenantRepo.GetBySubdomain(ctx, identifier)
    if err != nil {
        return nil, err
    }
    if tenant != nil {
        return tenant, nil
    }
    
    // Essayer par domain
    tenant, err = s.tenantRepo.GetByDomain(ctx, identifier)
    if err != nil {
        return nil, err
    }
    
    return tenant, nil
}

func (s *authService) hashRefreshToken(token string) string {
    hash, _ := bcrypt.GenerateFromPassword([]byte(token), bcrypt.DefaultCost)
    return string(hash)
}
