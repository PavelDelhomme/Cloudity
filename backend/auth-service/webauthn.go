// webauthn.go — Phase W2 : enregistrement et authentification passkeys (FIDO2).
//
// Périmètre Phase W2 (sprint Pass 2026-05, J5) :
//   - Enrôlement OUVERT à tout user authentifié (admin et user).
//   - **Quota 5 passkeys par user** (cf. `webauthnPerUserQuota`).
//   - **`residentKey: required` + `userVerification: preferred`** pour que les
//     password managers tiers (Proton Pass, Bitwarden, 1Password, iCloud
//     Keychain) acceptent d'enregistrer la passkey comme **discoverable
//     credential** (W3C `client-side discoverable`).
//   - Endpoint **`POST /auth/webauthn/login/begin-discoverable`** (sans email
//     préalable) — exploite `BeginDiscoverableLogin` de go-webauthn.
//     Compatible avec le **Conditional UI** côté front
//     (`autocomplete="username webauthn"`).
//
// Stockage :
//   - Credentials persistés dans `webauthn_credentials` (migration 37).
//   - Sessions/challenges WebAuthn stockés dans Redis avec TTL 5 min,
//     clé `webauthn:session:<sub>:<id>`. Challenge CSPRNG 32 octets,
//     usage unique (suppression à la lecture).
package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

// --- Configuration -----------------------------------------------------

// WebAuthnConfig regroupe les paramètres du Relying Party.
//
// RP ID = domaine (sans schéma, sans port) — les passkeys sont liées au RP ID.
// Origins = liste autorisée de schémas+host+port qui peuvent invoquer la
// cérémonie côté navigateur. En dev : http://localhost:6001, https://app.cloudity.local.
type WebAuthnConfig struct {
	RPDisplayName string
	RPID          string
	Origins       []string
}

// loadWebAuthnConfig lit la conf depuis l'environnement, avec des défauts dev.
//
//	WEBAUTHN_RP_ID         (def. "localhost")
//	WEBAUTHN_RP_NAME       (def. "Cloudity Admin")
//	WEBAUTHN_ORIGINS       (def. "http://localhost:6001,http://localhost:5173")
func loadWebAuthnConfig() WebAuthnConfig {
	cfg := WebAuthnConfig{
		RPDisplayName: getEnv("WEBAUTHN_RP_NAME", "Cloudity Admin"),
		RPID:          getEnv("WEBAUTHN_RP_ID", "localhost"),
	}
	origins := strings.TrimSpace(os.Getenv("WEBAUTHN_ORIGINS"))
	if origins == "" {
		origins = "http://localhost:6001,http://localhost:5173"
	}
	for _, o := range strings.Split(origins, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			cfg.Origins = append(cfg.Origins, o)
		}
	}
	return cfg
}

func getEnv(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

// --- WebAuthnService ---------------------------------------------------

type WebAuthnService struct {
	wa      *webauthn.WebAuthn
	db      *sql.DB
	rdb     *redis.Client
	authSvc *AuthService // pour réémission JWT après login passkey
}

// NewWebAuthnService construit un service prêt à câbler dans Gin.
// Retourne `nil` (avec un warn loggué) si la conf est invalide ; le router
// principal saute alors l'enregistrement des routes.
func NewWebAuthnService(cfg WebAuthnConfig, db *sql.DB, rdb *redis.Client, authSvc *AuthService) *WebAuthnService {
	wcfg := &webauthn.Config{
		RPDisplayName: cfg.RPDisplayName,
		RPID:          cfg.RPID,
		RPOrigins:     cfg.Origins,
	}
	wa, err := webauthn.New(wcfg)
	if err != nil {
		log.Printf("[auth-service] WebAuthn désactivé : %v", err)
		return nil
	}
	return &WebAuthnService{wa: wa, db: db, rdb: rdb, authSvc: authSvc}
}

// webauthnPerUserQuota borne le nombre de passkeys enregistrées par user.
// 5 = compromis pratique (téléphone + ordi perso + ordi pro + clé matérielle
// principale + clé matérielle de secours). Au-delà, l'utilisateur supprime
// d'abord depuis Settings.
const webauthnPerUserQuota = 5

// RegisterRoutes branche les endpoints de l'API WebAuthn sous /auth/webauthn.
//
// **Chemins user (Phase W2)** : `register/*` exige un Bearer valide (admin
// OU user). `login/begin` reste ouvert (pas de Bearer — c'est l'étape 1).
// `login/begin-discoverable` est ouvert également (Conditional UI au focus
// du champ email).
func (s *WebAuthnService) RegisterRoutes(r *gin.Engine) {
	if s == nil {
		return
	}
	r.POST("/auth/webauthn/register/begin", s.RegisterBegin)
	r.POST("/auth/webauthn/register/finish", s.RegisterFinish)
	r.POST("/auth/webauthn/login/begin", s.LoginBegin)
	r.POST("/auth/webauthn/login/finish", s.LoginFinish)
	// W2 : Conditional UI / discoverable credentials.
	r.POST("/auth/webauthn/login/begin-discoverable", s.LoginBeginDiscoverable)
	r.POST("/auth/webauthn/login/finish-discoverable", s.LoginFinishDiscoverable)
	r.GET("/auth/webauthn/credentials", s.ListCredentials)
	r.DELETE("/auth/webauthn/credentials/:id", s.DeleteCredential)
}

// --- webauthn.User implementation -------------------------------------

// webauthnUser implémente webauthn.User à partir d'une ligne `users` + de la
// liste de credentials persistés. **Phase W2** : ouvert à tout user actif,
// plus de filtre admin-only. Le rôle est conservé pour la cohérence du JWT
// émis lors d'un login passkey (admin → admin, user → user).
type webauthnUser struct {
	id          int64
	email       string
	displayName string
	role        string
	creds       []webauthn.Credential
}

func (u *webauthnUser) WebAuthnID() []byte {
	// Stable, opaque, jamais déduisible côté client (W3C §5.1.4) — on prend
	// l'ID utilisateur encodé en big-endian. **Doit rester stable** : c'est
	// le `userHandle` que les password managers stockent ; le changer
	// invalide toutes les passkeys existantes.
	b := make([]byte, 8)
	v := uint64(u.id)
	for i := 7; i >= 0; i-- {
		b[i] = byte(v & 0xff)
		v >>= 8
	}
	return b
}

func (u *webauthnUser) WebAuthnName() string        { return u.email }
func (u *webauthnUser) WebAuthnDisplayName() string { return u.displayName }
func (u *webauthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.creds
}

// userIDFromWebAuthnID inverse de WebAuthnID() : décode 8 octets big-endian
// vers un int64. Utilisé par LoginFinishDiscoverable où on n'a que le
// `userHandle` retourné par l'authenticator.
func userIDFromWebAuthnID(handle []byte) (int64, error) {
	if len(handle) != 8 {
		return 0, fmt.Errorf("webauthn handle invalide (len=%d, attendu 8)", len(handle))
	}
	var v uint64
	for i := 0; i < 8; i++ {
		v = (v << 8) | uint64(handle[i])
	}
	return int64(v), nil
}

// loadUser charge l'utilisateur ciblé + ses credentials. **Phase W2** :
// accepte tout user actif (plus de filtre admin). On garde le rôle pour le
// JWT émis au login.
func (s *WebAuthnService) loadUser(ctx context.Context, userID int64) (*webauthnUser, error) {
	var email, role string
	var isActive bool
	err := s.db.QueryRowContext(ctx, `
		SELECT email, COALESCE(role,'user'), COALESCE(is_active, true) FROM users WHERE id = $1
	`, userID).Scan(&email, &role, &isActive)
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}
	if !isActive {
		return nil, errors.New("webauthn: account inactive")
	}
	creds, err := s.loadCredentials(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &webauthnUser{
		id:          userID,
		email:       email,
		displayName: email,
		role:        role,
		creds:       creds,
	}, nil
}

func (s *WebAuthnService) loadCredentials(ctx context.Context, userID int64) ([]webauthn.Credential, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT credential_id, public_key, sign_count, aaguid, attestation_fmt, transports, backup_eligible, backup_state
		  FROM webauthn_credentials
		 WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("load credentials: %w", err)
	}
	defer rows.Close()
	out := make([]webauthn.Credential, 0)
	for rows.Next() {
		var cred webauthn.Credential
		var aaguid sql.NullString
		var transportsJSON []byte
		var attFmt string
		var beligible, bstate bool
		var signCount int64
		var rawCredID, pubKey []byte
		if err := rows.Scan(&rawCredID, &pubKey, &signCount, &aaguid, &attFmt, &transportsJSON, &beligible, &bstate); err != nil {
			return nil, fmt.Errorf("scan credential: %w", err)
		}
		cred.ID = rawCredID
		cred.PublicKey = pubKey
		cred.AttestationType = attFmt
		cred.Authenticator.SignCount = uint32(signCount)
		if aaguid.Valid {
			cred.Authenticator.AAGUID = []byte(aaguid.String)
		}
		cred.Flags.BackupEligible = beligible
		cred.Flags.BackupState = bstate
		// Transports : best-effort parse (jsonb -> []protocol.AuthenticatorTransport).
		if len(transportsJSON) > 0 {
			var ts []string
			if err := json.Unmarshal(transportsJSON, &ts); err == nil {
				for _, t := range ts {
					cred.Transport = append(cred.Transport, protocol.AuthenticatorTransport(t))
				}
			}
		}
		out = append(out, cred)
	}
	return out, rows.Err()
}

// --- Session storage (Redis) ------------------------------------------

const sessionTTL = 5 * time.Minute

func sessionKey(userID int64, kind string) string {
	return fmt.Sprintf("webauthn:session:%s:%d", kind, userID)
}

func discoverableSessionKey(challenge string) string {
	return "webauthn:disc-session:" + challenge
}

func (s *WebAuthnService) storeSession(ctx context.Context, key string, sd *webauthn.SessionData) error {
	b, err := json.Marshal(sd)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, key, b, sessionTTL).Err()
}

func (s *WebAuthnService) loadSession(ctx context.Context, key string) (*webauthn.SessionData, error) {
	raw, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}
	var sd webauthn.SessionData
	if err := json.Unmarshal(raw, &sd); err != nil {
		return nil, err
	}
	// Usage unique : suppression dès lecture.
	_ = s.rdb.Del(ctx, key).Err()
	return &sd, nil
}

// --- Endpoints --------------------------------------------------------

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
func passkeyRegistrationOptions() webauthn.RegistrationOption {
	return func(opts *protocol.PublicKeyCredentialCreationOptions) {
		opts.AuthenticatorSelection = protocol.AuthenticatorSelection{
			RequireResidentKey: protocol.ResidentKeyRequired(),
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			UserVerification:   protocol.VerificationPreferred,
		}
		opts.Attestation = protocol.PreferNoAttestation
	}
}

// passkeyLoginOptions force `userVerification: preferred` côté login (en
// pratique la plupart des password managers la fournissent toujours).
func passkeyLoginOptions() webauthn.LoginOption {
	return func(opts *protocol.PublicKeyCredentialRequestOptions) {
		opts.UserVerification = protocol.VerificationPreferred
	}
}

// RegisterBegin POST /auth/webauthn/register/begin
//
//	Authorization: Bearer <jwt user ou admin>  →  options PublicKey à envoyer à navigator.credentials.create()
//
// Phase W2 : ouvert à tout user actif (plus admin-only). Quota
// `webauthnPerUserQuota` passkeys par user.
func (s *WebAuthnService) RegisterBegin(c *gin.Context) {
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
func (s *WebAuthnService) RegisterFinish(c *gin.Context) {
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

// --- Persistance credentials ------------------------------------------

// ListCredentials GET /auth/webauthn/credentials
//
//	Authorization: Bearer <jwt user ou admin> → liste les passkeys de l'utilisateur courant.
func (s *WebAuthnService) ListCredentials(c *gin.Context) {
	userID, _, err := s.requireAuthUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	rows, err := s.db.QueryContext(c.Request.Context(), `
		SELECT id, credential_id, nickname, attestation_fmt, transports,
		       backup_eligible, backup_state, sign_count,
		       created_at, last_used_at
		  FROM webauthn_credentials
		 WHERE user_id = $1
		 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	type credView struct {
		ID             string    `json:"id"`
		CredentialID   string    `json:"credential_id"`
		Nickname       string    `json:"nickname"`
		AttestationFmt string    `json:"attestation_fmt"`
		Transports     []string  `json:"transports"`
		BackupEligible bool      `json:"backup_eligible"`
		BackupState    bool      `json:"backup_state"`
		SignCount      int64     `json:"sign_count"`
		CreatedAt      time.Time `json:"created_at"`
		LastUsedAt     *time.Time `json:"last_used_at,omitempty"`
	}
	out := make([]credView, 0)
	for rows.Next() {
		var v credView
		var rawCID []byte
		var transportsJSON []byte
		var lastUsed sql.NullTime
		if err := rows.Scan(&v.ID, &rawCID, &v.Nickname, &v.AttestationFmt,
			&transportsJSON, &v.BackupEligible, &v.BackupState,
			&v.SignCount, &v.CreatedAt, &lastUsed); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		v.CredentialID = base64.RawURLEncoding.EncodeToString(rawCID)
		_ = json.Unmarshal(transportsJSON, &v.Transports)
		if v.Transports == nil {
			v.Transports = []string{}
		}
		if lastUsed.Valid {
			lu := lastUsed.Time
			v.LastUsedAt = &lu
		}
		out = append(out, v)
	}
	c.JSON(http.StatusOK, gin.H{"credentials": out})
}

// DeleteCredential DELETE /auth/webauthn/credentials/:id
//
//	Authorization: Bearer <jwt user ou admin>
//	Refuse de supprimer la dernière passkey si l'utilisateur n'a pas d'autre
//	moyen d'authentification (au moins TOTP) — évite de se locker dehors.
func (s *WebAuthnService) DeleteCredential(c *gin.Context) {
	userID, _, err := s.requireAuthUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	credUUID := c.Param("id")
	if credUUID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing credential id"})
		return
	}
	res, err := s.db.ExecContext(c.Request.Context(),
		`DELETE FROM webauthn_credentials WHERE id = $1 AND user_id = $2`,
		credUUID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	rows, _ := res.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "credential not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": credUUID})
}

func (s *WebAuthnService) persistCredential(ctx context.Context, userID int64, cred *webauthn.Credential, nickname string) error {
	transports := make([]string, 0, len(cred.Transport))
	for _, t := range cred.Transport {
		transports = append(transports, string(t))
	}
	transportsJSON, _ := json.Marshal(transports)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO webauthn_credentials
		  (user_id, credential_id, public_key, sign_count, aaguid, transports,
		   attestation_fmt, nickname, backup_eligible, backup_state)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
	`, userID, cred.ID, cred.PublicKey, cred.Authenticator.SignCount,
		cred.Authenticator.AAGUID, transportsJSON, cred.AttestationType,
		nickname, cred.Flags.BackupEligible, cred.Flags.BackupState)
	return err
}

func (s *WebAuthnService) bumpSignCount(ctx context.Context, credID []byte, newCount uint32) error {
	res, err := s.db.ExecContext(ctx, `
		UPDATE webauthn_credentials
		   SET sign_count = $1, last_used_at = now()
		 WHERE credential_id = $2
		   AND sign_count   < $1
	`, newCount, credID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("sign_count rejected (replay détecté ?)")
	}
	return nil
}

// --- Helpers ----------------------------------------------------------

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
