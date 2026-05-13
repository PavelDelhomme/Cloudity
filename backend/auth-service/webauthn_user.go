// webauthn_user.go — Implémentation de `webauthn.User` + helpers de
// chargement (`loadUser`, `loadCredentials`, encodage handle ↔ user_id).

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

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
