// webauthn_auth.go — Helper d'extraction de l'utilisateur depuis le JWT
// Bearer pour les endpoints WebAuthn protégés.

package main

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// requireAuthUser extrait l'`id` et le rôle utilisateur depuis le JWT
// Bearer (RS256 ou EdDSA). **Phase W2** : accepte tout user authentifié
// (admin OU user, distinction faite via `role`). Ne consulte PAS la base.
//
// Pour les chemins admin-only (ex. liste credentials d'un autre user), le
// caller fait sa propre vérif sur le rôle retourné.
func (s *WebAuthnService) requireAuthUser(c *gin.Context) (int64, string, error) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return 0, "", errors.New("missing bearer token")
	}
	tokenStr := strings.TrimPrefix(auth, "Bearer ")
	parser := jwt.NewParser(jwt.WithValidMethods([]string{"RS256", "EdDSA"}))
	tok, err := parser.ParseWithClaims(tokenStr, &Claims{}, func(t *jwt.Token) (interface{}, error) {
		switch t.Method.Alg() {
		case "RS256":
			return s.authSvc.publicKey, nil
		case "EdDSA":
			return s.authSvc.edPublicKey, nil
		}
		return nil, fmt.Errorf("unexpected alg %q", t.Method.Alg())
	})
	if err != nil || !tok.Valid {
		return 0, "", fmt.Errorf("invalid token: %w", err)
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok {
		return 0, "", errors.New("invalid claims")
	}
	uid, err := strconv.ParseInt(claims.UserID, 10, 64)
	if err != nil {
		return 0, "", fmt.Errorf("invalid user id: %w", err)
	}
	role := claims.Role
	if strings.TrimSpace(role) == "" {
		role = "user"
	}
	return uid, role, nil
}
