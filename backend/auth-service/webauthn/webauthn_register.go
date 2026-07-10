// webauthn_register.go — Phase W2 : enrôlement passkey utilisateur.
//
// Endpoints :
//   - POST /auth/webauthn/register/begin   (Bearer)
//   - POST /auth/webauthn/register/finish  (Bearer)
//
// Quota : `webauthnPerUserQuota` passkeys par user (cf. `webauthn.go`).

package webauthn

import (
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	gwebauthn "github.com/go-webauthn/webauthn/webauthn"
)

// passkeyRegistrationOptions assemble les modificateurs `BeginRegistration`
// pour produire un credential **discoverable** (au sens W3C : « client-side
// discoverable credential »), seul format que les password managers tiers
// (Proton Pass, Bitwarden, 1Password, iCloud Keychain) acceptent
// d'enregistrer dans leur base.
//
//   - `RequireResidentKey: true` + `ResidentKey: required` : la clé privée
//     reste sur l'authenticator (ou son cloud), avec un identifiant
//     stable connu côté authenticator → permet la **résolution sans email**
//     au login (Conditional UI).
//   - `UserVerification: preferred` : on demande PIN/biométrie si dispo,
//     sans bloquer un user qui n'aurait pas de TouchID/Windows Hello.
//   - `AttestationPreference: none` : pas de telemetry constructeur.
func passkeyRegistrationOptions() gwebauthn.RegistrationOption {
	return func(opts *protocol.PublicKeyCredentialCreationOptions) {
		opts.AuthenticatorSelection = protocol.AuthenticatorSelection{
			RequireResidentKey: protocol.ResidentKeyRequired(),
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			UserVerification:   protocol.VerificationPreferred,
		}
		opts.Attestation = protocol.PreferNoAttestation
	}
}

// RegisterBegin POST /auth/webauthn/register/begin
//
//	Authorization: Bearer <jwt user ou admin>  →  options PublicKey à envoyer à navigator.credentials.create()
//
// Phase W2 : ouvert à tout user actif (plus admin-only). Quota
// `webauthnPerUserQuota` passkeys par user.
func (s *Service) RegisterBegin(c *gin.Context) {
	userID, _, err := s.requireAuthUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	user, err := s.loadUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	if len(user.creds) >= webauthnPerUserQuota {
		c.JSON(http.StatusForbidden, gin.H{
			"error": fmt.Sprintf(
				"quota atteint (%d passkeys max — supprime-en une avant d'en ajouter)",
				webauthnPerUserQuota),
		})
		return
	}
	options, sd, err := s.wa.BeginRegistration(user, passkeyRegistrationOptions())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("BeginRegistration: %v", err)})
		return
	}
	if err := s.storeSession(c.Request.Context(), sessionKey(userID, "register"), sd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("session store: %v", err)})
		return
	}
	c.JSON(http.StatusOK, options)
}

// RegisterFinish POST /auth/webauthn/register/finish
//
//	Authorization: Bearer <jwt user ou admin>  +  body = AuthenticatorAttestationResponse
func (s *Service) RegisterFinish(c *gin.Context) {
	userID, _, err := s.requireAuthUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	user, err := s.loadUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	sd, err := s.loadSession(c.Request.Context(), sessionKey(userID, "register"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session WebAuthn expirée — recommencer"})
		return
	}
	parsed, err := protocol.ParseCredentialCreationResponseBody(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("parse: %v", err)})
		return
	}
	cred, err := s.wa.CreateCredential(user, *sd, parsed)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("CreateCredential: %v", err)})
		return
	}
	if err := s.persistCredential(c.Request.Context(), userID, cred, c.DefaultPostForm("nickname", "passkey")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("persist: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"credential_id": base64.RawURLEncoding.EncodeToString(cred.ID),
	})
}
