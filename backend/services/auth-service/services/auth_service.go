
// Service d'authentification
type AuthService struct {
	repo      *AuthRepository
	jwtSecret string
}

func NewAuthService(repo *AuthRepository, jwtSecret string) *AuthService {
	return &AuthService{
		repo:      repo,
		jwtSecret: jwtSecret,
	}
}

func (s *AuthService) Login(ctx context.Context, req AuthRequest) (*AuthResponse, error) {
	// Authentifier l'utilisateur
	user, tenant, err := s.repo.AuthenticateUser(ctx, req.Email, req.Password, nil)
	if err != nil {
		return nil, err
	}

	// Générer les tokens JWT
	token, refreshToken, expiresAt, err := s.generateTokens(user, tenant)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{
		Token:        token,
		RefreshToken: refreshToken,
		User:         *user,
		Tenant:       *tenant,
		ExpiresAt:    expiresAt,
	}, nil
}

func (s *AuthService) generateTokens(user *User, tenant *Tenant) (string, string, time.Time, error) {
	expiresAt := time.Now().Add(24 * time.Hour)

	// Claims pour le token principal
	claims := jwt.MapClaims{
		"user_id":   user.ID.String(),
		"tenant_id": user.TenantID.String(),
		"email":     user.Email,
		"role":      user.Role,
		"exp":       expiresAt.Unix(),
		"iat":       time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", "", time.Time{}, err
	}

	// Refresh token (plus longue durée)
	refreshClaims := jwt.MapClaims{
		"user_id":   user.ID.String(),
		"tenant_id": user.TenantID.String(),
		"type":      "refresh",
		"exp":       time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":       time.Now().Unix(),
	}

	refreshToken := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshTokenString, err := refreshToken.SignedString([]byte(s.jwtSecret))
	if err != nil {
		return "", "", time.Time{}, err
	}

	return tokenString, refreshTokenString, expiresAt, nil
}