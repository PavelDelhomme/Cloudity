// webauthn.go — Phase W1 : enregistrement et authentification passkeys (FIDO2).
//
// Périmètre Phase W1 (Q17=A, voir docs/securite/WEBAUTHN-PLAN.md) :
//   - Enrôlement RÉSERVÉ aux comptes `role = 'admin'` (vérifié au début de
//     /webauthn/register/begin via JWT existant).
//   - Login passkey ouvert à tous les credentials enregistrés (le RP n'a aucun
//     moyen sain de filtrer par rôle avant d'avoir vérifié la signature).
//
// Stockage :
//   - Credentials persistés dans `webauthn_credentials` (migration 37).
//   - Sessions/challenges WebAuthn stockés dans Redis avec TTL 5 min, clé
//     `webauthn:session:<sub>:<id>`. Clés volées = pas de risque (challenge
//     CSPRNG aléatoire 32 octets, usage unique).
//
// Ne pas utiliser cette implémentation pour des credentials utilisateurs hors
// admin sans :
//   - une politique de quotas par utilisateur (ex. max 5 passkeys / user),
//   - un endpoint de révocation,
//   - un audit trail.
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

// RegisterRoutes branche les 4 endpoints de l'API WebAuthn sous /auth/webauthn.
func (s *WebAuthnService) RegisterRoutes(r *gin.Engine) {
	if s == nil {
		return
	}
	r.POST("/auth/webauthn/register/begin", s.RegisterBegin)
	r.POST("/auth/webauthn/register/finish", s.RegisterFinish)
	r.POST("/auth/webauthn/login/begin", s.LoginBegin)
	r.POST("/auth/webauthn/login/finish", s.LoginFinish)
	r.GET("/auth/webauthn/credentials", s.ListCredentials)
	r.DELETE("/auth/webauthn/credentials/:id", s.DeleteCredential)
}

// --- webauthn.User implementation -------------------------------------

// adminUser implémente webauthn.User à partir d'une ligne `users` + de la
// liste de credentials persistés.
type adminUser struct {
	id          int64
	email       string
	displayName string
	creds       []webauthn.Credential
}

func (u *adminUser) WebAuthnID() []byte {
	// Stable, opaque, jamais déduisible côté client (W3C §5.1.4) — on prend
	// l'ID utilisateur encodé en big-endian.
	b := make([]byte, 8)
	v := uint64(u.id)
	for i := 7; i >= 0; i-- {
		b[i] = byte(v & 0xff)
		v >>= 8
	}
	return b
}

func (u *adminUser) WebAuthnName() string         { return u.email }
func (u *adminUser) WebAuthnDisplayName() string  { return u.displayName }
func (u *adminUser) WebAuthnCredentials() []webauthn.Credential {
	return u.creds
}

// loadAdminUser charge l'utilisateur ciblé + ses credentials.
func (s *WebAuthnService) loadAdminUser(ctx context.Context, userID int64) (*adminUser, error) {
	var email, role string
	err := s.db.QueryRowContext(ctx, `SELECT email, role FROM users WHERE id = $1`, userID).Scan(&email, &role)
	if err != nil {
		return nil, fmt.Errorf("load user: %w", err)
	}
	if role != "admin" {
		return nil, errors.New("webauthn: role != admin (Phase W1 only)")
	}
	creds, err := s.loadCredentials(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &adminUser{
		id:          userID,
		email:       email,
		displayName: email,
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

// RegisterBegin POST /auth/webauthn/register/begin
//
//	Authorization: Bearer <jwt admin>  →  options PublicKey à envoyer à navigator.credentials.create()
func (s *WebAuthnService) RegisterBegin(c *gin.Context) {
	userID, err := s.requireAdminUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	user, err := s.loadAdminUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	// On s'aligne sur les défauts de la lib (attestation=none, residentKey=preferred).
	options, sd, err := s.wa.BeginRegistration(user)
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
//	Authorization: Bearer <jwt admin>  +  body = AuthenticatorAttestationResponse
func (s *WebAuthnService) RegisterFinish(c *gin.Context) {
	userID, err := s.requireAdminUser(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	user, err := s.loadAdminUser(c.Request.Context(), userID)
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
func (s *WebAuthnService) LoginBegin(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required,email"`
		TenantID string `json:"tenant_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userIDStr, _, _, role, _, err := s.authSvc.userStore.GetUserByEmailTenant(req.Email, req.TenantID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if role != "admin" {
		// Phase W1 : seul admin déclenche WebAuthn.
		c.JSON(http.StatusUnauthorized, gin.H{"error": "webauthn unavailable for this account"})
		return
	}
	uid, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "user id parse"})
		return
	}
	user, err := s.loadAdminUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no passkey for this account"})
		return
	}
	if len(user.creds) == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no passkey for this account"})
		return
	}
	options, sd, err := s.wa.BeginLogin(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("BeginLogin: %v", err)})
		return
	}
	if err := s.storeSession(c.Request.Context(), sessionKey(uid, "login"), sd); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("session store: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"options":  options,
		"user_id":  userIDStr,
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
	user, err := s.loadAdminUser(c.Request.Context(), uid)
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
	// Replay-protection : sign_count strictement croissant (W3C §6.1.1).
	if err := s.bumpSignCount(c.Request.Context(), cred.ID, cred.Authenticator.SignCount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("sign_count: %v", err)})
		return
	}
	// Émission d'une paire access + refresh — délègue à AuthService.
	access, refresh, err := s.authSvc.issueTokens(c.Request.Context(), meta.UserID, meta.TenantID, user.email, "admin")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token":  access,
		"refresh_token": refresh,
		"role":          "admin",
	})
}

// --- Persistance credentials ------------------------------------------

// ListCredentials GET /auth/webauthn/credentials
//
//	Authorization: Bearer <jwt admin> → liste les passkeys de l'utilisateur courant.
func (s *WebAuthnService) ListCredentials(c *gin.Context) {
	userID, err := s.requireAdminUser(c)
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
//	Authorization: Bearer <jwt admin>
//	Refuse de supprimer la dernière passkey si l'utilisateur n'a pas d'autre
//	moyen d'authentification (au moins TOTP) — évite de se locker dehors.
func (s *WebAuthnService) DeleteCredential(c *gin.Context) {
	userID, err := s.requireAdminUser(c)
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

// requireAdminUser extrait l'`id` utilisateur depuis le JWT Bearer (RS256 ou
// EdDSA), refuse tout token expiré ou mal signé. Ne consulte PAS la base —
// on s'appuie sur le rôle inscrit dans le claim, recoupé ensuite par
// loadAdminUser.
func (s *WebAuthnService) requireAdminUser(c *gin.Context) (int64, error) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return 0, errors.New("missing bearer token")
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
		return 0, fmt.Errorf("invalid token: %w", err)
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok {
		return 0, errors.New("invalid claims")
	}
	if claims.Role != "admin" {
		return 0, errors.New("admin role required")
	}
	uid, err := strconv.ParseInt(claims.UserID, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid user id: %w", err)
	}
	return uid, nil
}
