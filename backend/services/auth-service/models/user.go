
type User struct {
	ID        uuid.UUID `json:"id" db:"user_id"`
	TenantID  uuid.UUID `json:"tenant_id" db:"tenant_id"`
	Email     string    `json:"email" db:"email"`
	FirstName *string   `json:"first_name" db:"first_name"`
	LastName  *string   `json:"last_name" db:"last_name"`
	Role      string    `json:"role" db:"role"`
	IsActive  bool      `json:"is_active" db:"is_active"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}