package models

import (
	"time"
	"net"
	"github.com/google/uuid"
)

// UserSession représente une session utilisateur
type UserSession struct {
    SessionID        uuid.UUID `json:"session_id" db:"session_id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
    UserID           uuid.UUID `json:"user_id" db:"user_id" gorm:"not null;index" validate:"required"`
    TenantID         uuid.UUID `json:"tenant_id" db:"tenant_id" gorm:"not null;index" validate:"required"`
    RefreshTokenHash string    `json:"-" db:"refresh_token_hash" gorm:"not null"`
    IPAddress        *net.IP   `json:"ip_address" db:"ip_address" gorm:"type:inet"`
    UserAgent        *string   `json:"user_agent" db:"user_agent"`
    ExpiresAt        time.Time `json:"expires_at" db:"expires_at" gorm:"not null"`
    CreatedAt        time.Time `json:"created_at" db:"created_at" gorm:"autoCreateTime"`
    LastUsedAt       time.Time `json:"last_used_at" db:"last_used_at" gorm:"autoUpdateTime"`
    
    // Relations
    User   *User   `json:"user,omitempty" gorm:"foreignKey:UserID"`
    Tenant *Tenant `json:"tenant,omitempty" gorm:"foreignKey:TenantID"`
}

// TableName définit le nom de table pour Gorm
func (UserSession) TableName() string {
    return "user_sessions"
}

// IsExpired vérifie si la session est expirée
func (s *UserSession) IsExpired() bool {
    return time.Now().After(s.ExpiresAt)
}

// UpdateLastUsed met à jour le timestamp de dernière utilisation
func (s *UserSession) UpdateLastUsed() {
    s.LastUsedAt = time.Now()
}