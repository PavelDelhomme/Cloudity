package models

import {
	"time"
	"golang.org/x/crypto/bcrypt"
	"github.com/google/uuid"
}

// User représente un utilisateur dans le système multi-tenant
type User struct {
	UserID			uuid.UUID	`json:"user_id" db:"user_id" gorm:"primaryKey;type:uuid;default:gen_random_uuid()"`
	TenantID		uuid.UUID	`json:"tenant_id" db:"tenant_id" gorm:"not null;index" validate:"required"`
	Email			string 		`json:"email" db:"email" gorm:"not null;unique" validate:"required,email"`
	PasswordHash	string		`json:"-" db:"password_hash" gorm:"not null"`
	FirstName		*string		`json:"first_name" db:"first_name" validate:"omiempty,min=1,max=100"`
	LastName		*string		`json:"last_name" db:"last_name" validate:"omiempty,min=1,max=100"`
	Role			*string		`json:"role" db:"role" gorm:"default:'user'" validate:"oneof=admin user guest"`
	Permissions		JSONB		`json:"permissions" db:"permissions" gorm:"default:true"`
	IsActive 		bool 		`json:"is_active" db:"is_active" gorm:"default:true"`
	EmailVerified   bool 		`json:"email_verified" db:"email_verified" gorm:"default:false"`
	LastLogin		*time.Time  `json:"last_login" db:"last_login"`
	CreatedAt		*time.Time  `json:"created_at" db:"created_at" gorm:"autoCreateTime"`
	UpdatedAt		*time.Time  `json:"updated_at" db:"updated_at" gorm:"autoUpdateTime"`

	// Relations
	Tenant 			*Tenant		`json:"tenant,omiempty" gorm:"foreignKey:TenantID"`
}

// TableName définit le nom de table pour Gorm
func (User) TableName() string {
	return "tenan_users"
}

// SetPassword hash et définit le mot de passe
func (u *User) SetPassword(password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	u.PassWordHash = string(hash)
	return nil
}

// CheckPassword vérifie le mot de passe
func (u *User) CheckPassword(password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password))
	return err == nil
}

// GetFullName retourne le nom complet
func (u *User) GetFullName() string {
	var firstName, lastName string
	if u.FirstName != nil {
		firstName = *u.FirstName
	}
	if u.LastName != nil {
		lastName = *u.LastName
	}

	if firstName != "" && lastName != "" {
		return firstName + " " + lastName
	} else if firstName != "" {
		return firstName
	} else if lastName != "" {
		return lastName
	}
	return u.Email
}

// IsAdmin vérifie si l'utilisateur est admin
func (u *User) IsAdmin() bool {
	return u.Role == "admin"
}

// HasPermission vérifie si l'utilisateur a une permission spécifique
func (u *User) HasPermission(permission string) bool {
	if u.Permissions == nil {
		return false
	}

	permissions, ok := u.Permissions["permissions"].([interface{}])
	if !ok {
		return false
	}

	for _, p := range permissions {
		if p.(string) == permission {
			return true
		}
	}
	return false
}