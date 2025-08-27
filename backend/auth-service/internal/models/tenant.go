package models

import (
	"time",
	"database/sql/driver"
	"encoding/json"
	"errors"

	"github.com/google.uuid"
)

// JSONB type pour PostgreSQL
type JSONB map[string]interface{}

func (j JSONB) Value() (driver.Value, error) {
	if k == nil {
		return nil, nil
	}
	return json.Marshal(j)
}

func (j *JSONB) Scan(value interface{}) error {
	if value == nil {
		*j = nil
		return nil
	}

	bytes, ok := value.([]byte)
	if !ok {
		return errors.New("type assertion to []byte failed")
	}

	return json.Unmarshal(bytes, j)
}

// Tenant représente un tenant dans le système multi-tenant
type Tenant struct {
	TenantID uuid.UUID `json:"tenant_id" db:"tenant_id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	Name string `json:"name" db:"name" gorm:"not null;unique" validate:"required,min=2,max=255"`
	Domain *string `json:"domain" db:"domain" gorm:"unique"`
	Subdomain string `json:"subdomain" db:"subdomain" gorm:"not null;unique" validate:"required,min=2,max=63"`
	Settings JSONB `json:"settings" db:"setting" gorm:"type:jsonb;default:'{}'"`
	SubscriptionTier string `json:"subscription_tier" db:"subscription_tier" gorm:"default:'starter'" validate:"oneof=starter pro entreprise"` // Type de subscription (pas nécessaire vu que je ne vais normalement pas le vendre...)
	Status string `json:"status" db:"status" gorm:"default:'active'" validate:"oneof=active suspended deleted"`
	MaxUsers int `json:"max_users" db:"max_users" gorm:"default:100" validate:"min=1,max=10000"`
	MaxStorageGB int `json:"max_storage_gb" db:"max_storage_gb" gorm:"default:100" validate:"min=1,max=100000"`
	Features JSONB `json:"features" db:"features" gorm:"type:jsonb;default:'[]'"`
	CreatedAt time.Time `json:"created_at" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at" gorm:"autoUpdateTime"`	
}

// TableName définit le nom de table pour Gorm
func (Tenant) TableName() string {
	return "tenants"
}

// IsActive vérifie si le tenant est actif
func (t *Tenant) IsActive() bool {
	return t.Status == "active"
}

// HasFeature vérifie si le tenant a une fonctionnalité spécifique
func (t *Tenant) HasFeature(feature string) bool {
	if t.Features == nil {
		return false
	}

	features, ok := t.Features["features"].([]interface{})
	if !ok {
		return false
	}

	for _, f := range features {
		if f.(string) == feature {
			return true
		}
	}
	return false
}