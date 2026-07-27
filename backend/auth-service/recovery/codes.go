// Package recovery — codes de récupération 2FA (table recovery_codes).
package recovery

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const CodeCount = 10

const bcryptCost = 12

// Alphabet sans caractères ambigus (0/O, 1/I/L).
const Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

var ErrCodeNotFound = errors.New("recovery code not found or already used")

func GenerateCode() (string, error) {
	const total = 12
	out := make([]byte, total)
	buf := make([]byte, total)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for i := 0; i < total; i++ {
		out[i] = Alphabet[int(buf[i])%len(Alphabet)]
	}
	return string(out[0:4]) + "-" + string(out[4:8]) + "-" + string(out[8:12]), nil
}

func NormalizeCode(raw string) string {
	cleaned := strings.ToUpper(strings.TrimSpace(raw))
	cleaned = strings.ReplaceAll(cleaned, "-", "")
	cleaned = strings.ReplaceAll(cleaned, " ", "")
	return cleaned
}

// LooksLikeRecoveryCode distingue un code 12 chars d'un TOTP 6 chiffres.
func LooksLikeRecoveryCode(raw string) bool {
	cleaned := NormalizeCode(raw)
	if len(cleaned) != 12 {
		return false
	}
	for i := 0; i < len(cleaned); i++ {
		c := cleaned[i]
		if !((c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
			return false
		}
	}
	return true
}

// GenerateAndStore purge puis insère CodeCount codes ; retourne les codes en clair (une seule fois).
func GenerateAndStore(ctx context.Context, db *sql.DB, userID string) ([]string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM recovery_codes WHERE user_id = $1::int`, userID); err != nil {
		return nil, fmt.Errorf("purge: %w", err)
	}

	codes := make([]string, 0, CodeCount)
	for i := 0; i < CodeCount; i++ {
		code, err := GenerateCode()
		if err != nil {
			return nil, fmt.Errorf("rng: %w", err)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(code), bcryptCost)
		if err != nil {
			return nil, fmt.Errorf("bcrypt: %w", err)
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1::int, $2)
		`, userID, string(hash)); err != nil {
			return nil, fmt.Errorf("insert: %w", err)
		}
		codes = append(codes, code)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return codes, nil
}

// VerifyAndConsume matche submitted contre les hash actifs et marque used_at.
func VerifyAndConsume(ctx context.Context, db *sql.DB, userID, submitted string) error {
	cleaned := NormalizeCode(submitted)
	canonical := cleaned[0:4] + "-" + cleaned[4:8] + "-" + cleaned[8:12]

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	rows, err := tx.QueryContext(ctx, `
		SELECT id, code_hash FROM recovery_codes
		 WHERE user_id = $1::int AND used_at IS NULL
		 ORDER BY created_at
	`, userID)
	if err != nil {
		return fmt.Errorf("query: %w", err)
	}
	type row struct {
		id   string
		hash string
	}
	all := make([]row, 0, CodeCount)
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.hash); err != nil {
			rows.Close()
			return err
		}
		all = append(all, r)
	}
	rows.Close()

	matchedID := ""
	for _, r := range all {
		if bcrypt.CompareHashAndPassword([]byte(r.hash), []byte(canonical)) == nil {
			if matchedID == "" {
				matchedID = r.id
			}
		}
	}
	if matchedID == "" {
		return ErrCodeNotFound
	}
	res, err := tx.ExecContext(ctx, `
		UPDATE recovery_codes SET used_at = now()
		 WHERE id = $1 AND used_at IS NULL
	`, matchedID)
	if err != nil {
		return fmt.Errorf("consume: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrCodeNotFound
	}
	return tx.Commit()
}

// CountActive renvoie le nombre de codes encore utilisables pour un user.
func CountActive(ctx context.Context, db *sql.DB, userID string) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM recovery_codes
		 WHERE user_id = $1::int AND used_at IS NULL
	`, userID).Scan(&n)
	return n, err
}
