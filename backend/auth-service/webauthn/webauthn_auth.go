// webauthn_auth.go — Helper d'extraction de l'utilisateur depuis le JWT
// Bearer pour les endpoints WebAuthn protégés.

package webauthn

import (
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
)

// requireAuthUser extrait l'`id` et le rôle utilisateur depuis le JWT
// Bearer (RS256 ou EdDSA). **Phase W2** : accepte tout user authentifié
// (admin OU user, distinction faite via `role`). Ne consulte PAS la base.
//
// Pour les chemins admin-only (ex. liste credentials d'un autre user), le
// caller fait sa propre vérif sur le rôle retourné.
func (s *Service) requireAuthUser(c *gin.Context) (int64, string, error) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return 0, "", errors.New("missing bearer token")
	}
	tokenStr := strings.TrimPrefix(auth, "Bearer ")
	return s.bridge.VerifyBearerToken(tokenStr)
}
