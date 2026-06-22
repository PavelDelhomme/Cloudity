// webauthn_credentials.go — Endpoints CRUD passkeys + helpers persistance.
//
// Endpoints :
//   - GET    /auth/webauthn/credentials       (Bearer)
//   - DELETE /auth/webauthn/credentials/:id   (Bearer)
//
// Helpers internes : `persistCredential` (INSERT après register) et
// `bumpSignCount` (UPDATE atomique anti-replay au login).

package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/webauthn"
)

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
		ID             string     `json:"id"`
		CredentialID   string     `json:"credential_id"`
		Nickname       string     `json:"nickname"`
		AttestationFmt string     `json:"attestation_fmt"`
		Transports     []string   `json:"transports"`
		BackupEligible bool       `json:"backup_eligible"`
		BackupState    bool       `json:"backup_state"`
		SignCount      int64      `json:"sign_count"`
		CreatedAt      time.Time  `json:"created_at"`
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

// bumpSignCount valide le `sign_count` retourné par l'authenticator au login
// et le persiste. La condition `sign_count < $1` rejette tout replay quand le
// compteur augmente. Les gestionnaires synchronisés (Bitwarden, iCloud
// Keychain) peuvent renvoyer le même sign_count (souvent 0) sur plusieurs
// logins tant que le compteur local n'a pas bougé — ValidateLogin a déjà
// accepté l'assertion dans ce cas.
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
	if rows > 0 {
		return nil
	}
	var stored int64
	err = s.db.QueryRowContext(ctx, `
		SELECT sign_count FROM webauthn_credentials WHERE credential_id = $1
	`, credID).Scan(&stored)
	if err != nil {
		return err
	}
	if uint32(stored) == newCount {
		_, err = s.db.ExecContext(ctx, `
			UPDATE webauthn_credentials SET last_used_at = now() WHERE credential_id = $1
		`, credID)
		return err
	}
	return errors.New("sign_count rejected (replay détecté ?)")
}
