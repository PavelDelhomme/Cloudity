// webauthn_login.go — Phase W2 : login passkey (regular + discoverable).
//
// Endpoints :
//   - POST /auth/webauthn/login/begin
//   - POST /auth/webauthn/login/finish
//   - POST /auth/webauthn/login/begin-discoverable   (Conditional UI)
//   - POST /auth/webauthn/login/finish-discoverable

package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// passkeyLoginOptions force `userVerification: preferred` côté login (en
// pratique la plupart des password managers la fournissent toujours).
func passkeyLoginOptions() webauthn.LoginOption {
	return func(opts *protocol.PublicKeyCredentialRequestOptions) {
		opts.UserVerification = protocol.VerificationPreferred
	}
}

// LoginBegin POST /auth/webauthn/login/begin
//
//	body = { "email": "<user@cloudity>", "tenant_id": "<tid>" }
//	Pas d'authn préalable : c'est l'étape 1 du login.
//
// Phase W2 : ouvert à tout user qui a au moins une passkey enregistrée.
// Le rôle est déterminé à `LoginFinish` à partir de la base.
func (s *WebAuthnService) LoginBegin(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		TenantID string `json:"tenant_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userIDStr, _, _, _, _, err := s.authSvc.userStore.GetUserByEmailTenant(req.Email, req.TenantID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	uid, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user id parse"})
		return
	}
	user, err := s.loadUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no passkey for this account"})
		return
	}
	if len(user.creds) == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no passkey for this account"})
		return
	}
	options, sd, err := s.wa.BeginLogin(user, passkeyLoginOptions())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("BeginLogin: %v", err)})
		return
	}
	if err := s.storeSession(c.Request.Context(), sessionKey(uid, "login"), sd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("session store: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"options": options,
		"user_id": userIDStr,
	})
}

// LoginFinish POST /auth/webauthn/login/finish
//
//	body = { "user_id": "<id>", "tenant_id": "<tid>", "assertion": <PublicKeyCredential> }
func (s *WebAuthnService) LoginFinish(c *gin.Context) {
	var meta struct {
		UserID    string          `json:"user_id" binding:"required"`
		TenantID  string          `json:"tenant_id" binding:"required"`
		Assertion json.RawMessage `json:"assertion" binding:"required"`
	}
	if err := c.ShouldBindJSON(&meta); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	uid, err := strconv.ParseInt(meta.UserID, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user_id"})
		return
	}
	user, err := s.loadUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	sd, err := s.loadSession(c.Request.Context(), sessionKey(uid, "login"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session expirée — relancer login/begin"})
		return
	}
	parsed, err := protocol.ParseCredentialRequestResponseBody(strings.NewReader(string(meta.Assertion)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("parse: %v", err)})
		return
	}
	cred, err := s.wa.ValidateLogin(user, *sd, parsed)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("ValidateLogin: %v", err)})
		return
	}
	if err := s.bumpSignCount(c.Request.Context(), cred.ID, cred.Authenticator.SignCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("sign_count: %v", err)})
		return
	}
	access, refresh, err := s.authSvc.issueTokens(c.Request.Context(), meta.UserID, meta.TenantID, user.email, user.role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token":  access,
		"refresh_token": refresh,
		"role":          user.role,
	})
}

// LoginBeginDiscoverable POST /auth/webauthn/login/begin-discoverable
//
//	Pas de body : on attend juste une challenge sans email préalable.
//	C'est l'API consommée par le **Conditional UI** (front : `mediation:
//	"conditional"` sur `navigator.credentials.get`). Le PM tiers (Proton
//	Pass, Bitwarden, iCloud Keychain) propose la passkey directement au
//	focus du champ email — comme sur GitHub / Google.
//
// La résolution `userHandle → user_id` se fera à `LoginFinishDiscoverable`
// quand l'authenticator aura signé le challenge et révélé le `userHandle`.
func (s *WebAuthnService) LoginBeginDiscoverable(c *gin.Context) {
	options, sd, err := s.wa.BeginDiscoverableLogin(passkeyLoginOptions())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("BeginDiscoverableLogin: %v", err)})
		return
	}
	// `sd.Challenge` est déjà une string base64url (cf. `webauthn.SessionData`
	// dans go-webauthn ≥ 0.13). On l'utilise telle quelle comme clé Redis ;
	// le client la renverra à l'identique dans `LoginFinishDiscoverable`.
	if err := s.storeSession(c.Request.Context(), discoverableSessionKey(sd.Challenge), sd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("session store: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"options": options,
	})
}

// LoginFinishDiscoverable POST /auth/webauthn/login/finish-discoverable
//
//	body = { "tenant_id": "<tid>", "challenge": "<b64url>", "assertion": <PublicKeyCredential> }
//
// Le `userHandle` est lu depuis l'assertion ; on le résout en `user_id`
// (inverse de `WebAuthnID()`). Le role provient de la base.
func (s *WebAuthnService) LoginFinishDiscoverable(c *gin.Context) {
	var meta struct {
		TenantID  string          `json:"tenant_id" binding:"required"`
		Challenge string          `json:"challenge" binding:"required"`
		Assertion json.RawMessage `json:"assertion" binding:"required"`
	}
	if err := c.ShouldBindJSON(&meta); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	sd, err := s.loadSession(c.Request.Context(), discoverableSessionKey(meta.Challenge))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session expirée — relancer login/begin-discoverable"})
		return
	}
	parsed, err := protocol.ParseCredentialRequestResponseBody(strings.NewReader(string(meta.Assertion)))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("parse: %v", err)})
		return
	}
	// La discoverable login expose un handler qui résout l'user via le
	// `userHandle` retourné par l'authenticator.
	cred, err := s.wa.ValidateDiscoverableLogin(
		func(rawID, userHandle []byte) (webauthn.User, error) {
			uid, err := userIDFromWebAuthnID(userHandle)
			if err != nil {
				return nil, err
			}
			return s.loadUser(c.Request.Context(), uid)
		},
		*sd, parsed,
	)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": fmt.Sprintf("ValidateDiscoverableLogin: %v", err)})
		return
	}
	// Récupère userID + email + role pour l'émission du JWT.
	var userID int64
	if u, err := userIDFromWebAuthnID(parsed.Response.UserHandle); err == nil {
		userID = u
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "userHandle invalide"})
		return
	}
	user, err := s.loadUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	if err := s.bumpSignCount(c.Request.Context(), cred.ID, cred.Authenticator.SignCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("sign_count: %v", err)})
		return
	}
	access, refresh, err := s.authSvc.issueTokens(c.Request.Context(),
		strconv.FormatInt(userID, 10), meta.TenantID, user.email, user.role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token":  access,
		"refresh_token": refresh,
		"role":          user.role,
		"user_id":       strconv.FormatInt(userID, 10),
		"email":         user.email,
	})
}
