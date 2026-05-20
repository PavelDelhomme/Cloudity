package main

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// resolveAliasDelivery cherche un alias actif et la cible de livraison (MTA entrant).
func (h *Handler) resolveAliasDelivery(ctx context.Context, aliasEmail string) (accountID int, deliverTo string, found bool, err error) {
	em := strings.TrimSpace(strings.ToLower(aliasEmail))
	if em == "" || !strings.Contains(em, "@") {
		return 0, "", false, nil
	}
	err = h.db.QueryRowContext(ctx, `
		SELECT a.account_id,
			COALESCE(NULLIF(TRIM(a.deliver_target_email), ''), u.email) AS deliver_to
		FROM user_email_aliases a
		INNER JOIN user_email_accounts u ON u.id = a.account_id
		WHERE LOWER(TRIM(a.alias_email)) = $1
		  AND COALESCE(a.enabled, true) = true
		LIMIT 1
	`, em).Scan(&accountID, &deliverTo)
	if err == sql.ErrNoRows {
		return 0, "", false, nil
	}
	if err != nil {
		return 0, "", false, err
	}
	deliverTo = strings.TrimSpace(deliverTo)
	if deliverTo == "" {
		return 0, "", false, nil
	}
	return accountID, deliverTo, true, nil
}

func mtaInternalTokenOK(c *gin.Context) bool {
	expected := strings.TrimSpace(os.Getenv("MTA_INTERNAL_TOKEN"))
	if expected == "" {
		return false
	}
	got := strings.TrimSpace(c.GetHeader("X-MTA-Internal-Token"))
	if got == "" {
		got = strings.TrimSpace(c.GetHeader("Authorization"))
		if strings.HasPrefix(strings.ToLower(got), "bearer ") {
			got = strings.TrimSpace(got[7:])
		}
	}
	if got == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(got), []byte(expected)) == 1
}

// POST /mail/internal/alias-resolve — résolution RCPT alias → boîte cible (MTA, hors JWT).
func (h *Handler) internalAliasResolve(c *gin.Context) {
	if !mtaInternalTokenOK(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or missing MTA internal token"})
		return
	}
	var body struct {
		AliasEmail string `json:"alias_email"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	accountID, deliverTo, found, err := h.resolveAliasDelivery(c.Request.Context(), body.AliasEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "alias unknown or disabled", "alias_email": strings.TrimSpace(strings.ToLower(body.AliasEmail))})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"ok":               true,
		"alias_email":      strings.TrimSpace(strings.ToLower(body.AliasEmail)),
		"deliver_to":       deliverTo,
		"account_id":       accountID,
		"preserve_headers": []string{"Delivered-To", "X-Original-To", "X-Envelope-To"},
	})
}
