// recovery_codes.go — Codes de récupération 2FA (table `recovery_codes`).
//
// Générés à l'activation 2FA (`Verify2FA` quand le bit `is_2fa_enabled`
// passe de `false` à `true`) et lors d'une régénération explicite. Hashés
// bcrypt cost 12. Chaque code est utilisable UNE FOIS (`used_at`).
//
// Au login étape 2, l'utilisateur peut taper soit son TOTP (6 chiffres) soit
// un code de récupération. On distingue :
//   - 6 chiffres → traité comme TOTP par `Verify2FA` historique.
//   - 14 caractères au format `XXXX-XXXX-XXXX` (12 chars hors tirets) →
//     traité comme code de récupération par `verifyRecoveryCode`.
//
// Référence : docs/produit/SPRINT-PASS-2026-05.md J5,
//             infrastructure/postgresql/migrations/38-recovery-codes.sql.

package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// recoveryCodeCount — nombre de codes générés à chaque activation/régénération.
// 10 = standard de l'industrie (GitHub, Google, etc.). Permet de garder une
// marge raisonnable sans encombrer l'utilisateur.
const recoveryCodeCount = 10

// recoveryCodeBcryptCost — coût bcrypt du hash des codes. 12 ≈ 250 ms
// par tentative sur un CPU moderne, ce qui agit comme un rate-limit
// implicite sur les attaques en ligne (10 codes × 250 ms = 2,5 s pour un
// brute force complet d'un seul user, ce qui est trivialement défaitable
// par un rate-limit applicatif côté login).
const recoveryCodeBcryptCost = 12

// recoveryCodeAlphabet — alphabet des codes en clair. **Sans** caractères
// ambigus (0/O, 1/I/L) pour faciliter la transcription papier.
const recoveryCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

// generateRecoveryCode produit une chaîne 12-caractères au format
// `XXXX-XXXX-XXXX`. Entropie : 12 × log2(31) ≈ 59,4 bits — suffisant
// pour résister à une recherche en ligne avec rate-limit.
func generateRecoveryCode() (string, error) {
	const total = 12
	out := make([]byte, total)
	buf := make([]byte, total)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	for i := 0; i < total; i++ {
		out[i] = recoveryCodeAlphabet[int(buf[i])%len(recoveryCodeAlphabet)]
	}
	// Format `XXXX-XXXX-XXXX`.
	return string(out[0:4]) + "-" + string(out[4:8]) + "-" + string(out[8:12]), nil
}

// normalizeRecoveryCode strippe les tirets/espaces et met en majuscules.
// Permet à l'utilisateur de saisir avec ou sans tirets, en minuscule, etc.
func normalizeRecoveryCode(raw string) string {
	cleaned := strings.ToUpper(strings.TrimSpace(raw))
	cleaned = strings.ReplaceAll(cleaned, "-", "")
	cleaned = strings.ReplaceAll(cleaned, " ", "")
	return cleaned
}

// looksLikeRecoveryCode permet à `Verify2FA` (qui accepte aussi le TOTP) de
// décider quel chemin prendre. Vrai si la chaîne nettoyée fait 12 chars
// alphanumériques. Faux si elle ressemble à un TOTP 6 chiffres.
func looksLikeRecoveryCode(raw string) bool {
	cleaned := normalizeRecoveryCode(raw)
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

// generateAndStoreRecoveryCodes purge les codes existants de l'user puis
// en insère N nouveaux. Renvoie la liste des codes en CLAIR — c'est la
// SEULE et UNIQUE fois qu'ils seront visibles. À montrer immédiatement
// à l'utilisateur dans l'UI avec invitation à les sauvegarder.
//
// Tout est dans une transaction unique : si une seule insertion échoue,
// on rollback (l'utilisateur peut re-cliquer "Régénérer").
func generateAndStoreRecoveryCodes(ctx context.Context, db *sql.DB, userID string) ([]string, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM recovery_codes WHERE user_id = $1::int`, userID); err != nil {
		return nil, fmt.Errorf("purge: %w", err)
	}

	codes := make([]string, 0, recoveryCodeCount)
	for i := 0; i < recoveryCodeCount; i++ {
		code, err := generateRecoveryCode()
		if err != nil {
			return nil, fmt.Errorf("rng: %w", err)
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(code), recoveryCodeBcryptCost)
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

// errRecoveryCodeNotFound est renvoyée par verifyAndConsumeRecoveryCode quand
// aucun code valide ne correspond. Pas exporté : le handler la convertit en
// `401 invalid code` générique pour ne pas révéler l'existence d'un user.
var errRecoveryCodeNotFound = errors.New("recovery code not found or already used")

// verifyAndConsumeRecoveryCode tente de matcher `submitted` contre l'un des
// codes valides de `userID`. Si match, marque le code comme utilisé
// (`used_at = now()`) dans la même transaction et renvoie nil.
//
// **Side-channel** : on bcrypt-compare contre TOUS les hash (jusqu'au
// premier match), pas seulement le premier. Ça donne un timing constant
// indépendamment du nombre de codes restants — important pour ne pas
// signaler à l'attaquant qu'il a "presque" trouvé.
func verifyAndConsumeRecoveryCode(ctx context.Context, db *sql.DB, userID, submitted string) error {
	cleaned := normalizeRecoveryCode(submitted)
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
	all := make([]row, 0, recoveryCodeCount)
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
			// On ne casse pas : timing constant.
		}
	}
	if matchedID == "" {
		return errRecoveryCodeNotFound
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
		// Race : un autre process a consommé entre le SELECT et l'UPDATE.
		return errRecoveryCodeNotFound
	}
	return tx.Commit()
}

// countActiveRecoveryCodes renvoie le nombre de codes encore utilisables
// pour un user. UI : afficher un avertissement si <= 2.
func countActiveRecoveryCodes(ctx context.Context, db *sql.DB, userID string) (int, error) {
	var n int
	err := db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM recovery_codes
		 WHERE user_id = $1::int AND used_at IS NULL
	`, userID).Scan(&n)
	return n, err
}

// --- Handlers HTTP ----------------------------------------------------

// RegenerateRecoveryCodes — POST /auth/2fa/recovery-codes/regenerate
// (Bearer obligatoire, l'access token doit avoir un rôle valide). Renvoie
// les 10 nouveaux codes UNE FOIS.
func (a *AuthService) RegenerateRecoveryCodes(c *gin.Context) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	store, ok := a.userStore.(*postgresUserStore)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "recovery codes require postgres user store"})
		return
	}
	codes, err := generateAndStoreRecoveryCodes(c.Request.Context(), store.db, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("regenerate: %v", err)})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"codes": codes,
		"count": len(codes),
		"warning": "Sauvegarde-les MAINTENANT — ils ne réapparaîtront plus. " +
			"Sans 2FA et sans ces codes, tu seras locké dehors si tu perds ton authenticator.",
	})
}

// CountRecoveryCodes — GET /auth/2fa/recovery-codes/count
// Bearer obligatoire. Renvoie juste le nombre restant — UI affiche un
// warning si <=2.
func (a *AuthService) CountRecoveryCodes(c *gin.Context) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing bearer token"})
		return
	}
	claims, err := a.parseAccessToken(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}
	store, ok := a.userStore.(*postgresUserStore)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "recovery codes require postgres user store"})
		return
	}
	n, err := countActiveRecoveryCodes(c.Request.Context(), store.db, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"active": n})
}
