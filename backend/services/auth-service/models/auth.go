
type AuthRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Domain   string `json:"domain,omitempty"`
}


type AuthResponse struct {
	Token        string    `json:"token"`
	RefreshToken string    `json:"refresh_token"`
	User         User      `json:"user"`
	Tenant       Tenant    `json:"tenant"`
	ExpiresAt    time.Time `json:"expires_at"`
}