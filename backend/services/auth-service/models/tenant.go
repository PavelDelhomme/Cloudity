
type Tenant struct {
	ID               uuid.UUID `json:"id" db:"tenant_id"`
	Name             string    `json:"name" db:"name"`
	Domain           *string   `json:"domain" db:"domain"`
	SubscriptionTier string    `json:"subscription_tier" db:"subscription_tier"`
	Status           string    `json:"status" db:"status"`
	CreatedAt        time.Time `json:"created_at" db:"created_at"`
}
