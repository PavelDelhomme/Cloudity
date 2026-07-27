package main

import (
	"context"
	"strconv"
	"strings"

	"github.com/pavel/cloudity/auth-service/webauthn"
)

type authWebAuthnBridge struct {
	auth *AuthService
}

func (a *AuthService) webauthnBridge() webauthn.AuthBridge {
	return &authWebAuthnBridge{auth: a}
}

func (b *authWebAuthnBridge) VerifyBearerToken(tokenStr string) (userID int64, role string, err error) {
	claims, err := b.auth.parseAccessToken(tokenStr)
	if err != nil {
		return 0, "", err
	}
	uid, err := strconv.ParseInt(claims.UserID, 10, 64)
	if err != nil {
		return 0, "", err
	}
	role = strings.TrimSpace(claims.Role)
	if role == "" {
		role = "user"
	}
	return uid, role, nil
}

func (b *authWebAuthnBridge) GetUserByEmailTenant(email, tenantID string) (userID, passwordHash, totpSecret, role string, is2FAEnabled bool, err error) {
	return b.auth.userStore.GetUserByEmailTenant(email, tenantID)
}

func (b *authWebAuthnBridge) IssueTokens(ctx context.Context, userID, tenantID int64, email, role string) (access, refresh string, err error) {
	return b.auth.issueTokens(ctx, strconv.FormatInt(userID, 10), strconv.FormatInt(tenantID, 10), email, role)
}
