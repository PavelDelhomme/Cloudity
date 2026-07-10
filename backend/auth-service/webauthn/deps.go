package webauthn

import "context"

// AuthBridge découple le package webauthn du package main.
type AuthBridge interface {
	VerifyBearerToken(tokenStr string) (userID int64, role string, err error)
	GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret, role string, is2FAEnabled bool, err error)
	IssueTokens(ctx context.Context, userID, tenantID int64, email, role string) (access, refresh string, err error)
}
