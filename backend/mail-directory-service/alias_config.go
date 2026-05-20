package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/gin-gonic/gin"
)

// MailAliasConfigResponse — config alias exposée au front (GET /mail/me/alias-config).
type MailAliasConfigResponse struct {
	PrimaryDomain       string `json:"primary_domain,omitempty"`
	AliasHostSuffix     string `json:"alias_host_suffix,omitempty"`
	UserAliasHostSuffix string `json:"user_alias_host_suffix,omitempty"`
	ValidationStrict    bool   `json:"validation_strict"`
	EnvConfigured       bool   `json:"env_configured"`
}

func mailAliasConfigFromEnv() (primaryDomain, aliasHostSuffix string, validationStrict bool) {
	primaryDomain = strings.TrimSpace(strings.ToLower(os.Getenv("MAIL_PRIMARY_DOMAIN")))
	aliasHostSuffix = strings.TrimSpace(strings.ToLower(os.Getenv("MAIL_ALIAS_SUBDOMAIN")))
	if aliasHostSuffix == "" {
		// Mode MTA alias : deploy/mail-mta utilise MAIL_ALIAS_DOMAIN. En dev local,
		// on accepte cette variable comme suffixe direct sans exiger MAIL_PRIMARY_DOMAIN.
		aliasHostSuffix = strings.TrimSpace(strings.ToLower(os.Getenv("MAIL_ALIAS_DOMAIN")))
	}
	aliasHostSuffix = strings.TrimPrefix(aliasHostSuffix, "@")
	if aliasHostSuffix == "" && primaryDomain != "" {
		aliasHostSuffix = "alias." + primaryDomain
	}
	validationStrict = primaryDomain != "" ||
		strings.TrimSpace(os.Getenv("MAIL_ALIAS_SUBDOMAIN")) != "" ||
		strings.TrimSpace(os.Getenv("MAIL_ALIAS_DOMAIN")) != ""
	return primaryDomain, aliasHostSuffix, validationStrict
}

func mailAliasConfigResponse() MailAliasConfigResponse {
	primary, suffix, strict := mailAliasConfigFromEnv()
	return MailAliasConfigResponse{
		PrimaryDomain:    primary,
		AliasHostSuffix:  suffix,
		ValidationStrict: strict,
		EnvConfigured:    strict,
	}
}

func emailDomain(addr string) string {
	addr = strings.TrimSpace(strings.ToLower(addr))
	i := strings.LastIndex(addr, "@")
	if i < 0 || i >= len(addr)-1 {
		return ""
	}
	return addr[i+1:]
}

// resolveAliasHostSuffix — priorité : préférence utilisateur → env → alias.<domaine boîte>.
func resolveAliasHostSuffix(userSuffix, accountEmail string) string {
	userSuffix = strings.TrimSpace(strings.ToLower(userSuffix))
	userSuffix = strings.TrimPrefix(userSuffix, "@")
	if userSuffix != "" {
		return userSuffix
	}
	_, suffix, _ := mailAliasConfigFromEnv()
	if suffix != "" {
		return suffix
	}
	if dom := emailDomain(accountEmail); dom != "" {
		return "alias." + dom
	}
	return ""
}

// effectiveAliasHostSuffix — sans préférence utilisateur (tests, fallback).
func effectiveAliasHostSuffix(accountEmail string) string {
	return resolveAliasHostSuffix("", accountEmail)
}

func (h *Handler) loadUserAliasHostSuffix(ctx context.Context, userID int) (string, error) {
	if userID <= 0 || h.db == nil {
		return "", nil
	}
	var suffix sql.NullString
	err := h.dbex(ctx).QueryRow(`
		SELECT alias_host_suffix FROM mail_user_alias_prefs WHERE user_id = $1
	`, userID).Scan(&suffix)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if !suffix.Valid {
		return "", nil
	}
	return strings.TrimPrefix(strings.TrimSpace(strings.ToLower(suffix.String)), "@"), nil
}

func (h *Handler) mailAliasConfigForUser(ctx context.Context, userID int, accountEmail string) (MailAliasConfigResponse, error) {
	primary, envSuffix, strict := mailAliasConfigFromEnv()
	userSuffix, err := h.loadUserAliasHostSuffix(ctx, userID)
	if err != nil {
		return MailAliasConfigResponse{}, err
	}
	effective := resolveAliasHostSuffix(userSuffix, accountEmail)
	resp := MailAliasConfigResponse{
		PrimaryDomain:       primary,
		AliasHostSuffix:     effective,
		UserAliasHostSuffix: userSuffix,
		ValidationStrict:    strict,
		EnvConfigured:       strict,
	}
	if effective == "" && envSuffix != "" {
		resp.AliasHostSuffix = envSuffix
	}
	return resp, nil
}

func sanitizeAliasLocalPart(local string) string {
	local = strings.TrimSpace(strings.ToLower(local))
	if local == "" {
		return ""
	}
	var b strings.Builder
	for _, r := range local {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '_' || r == '+' || r == '-' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// normalizeAliasEmail complète un local-part seul en adresse complète si un suffixe est connu.
func normalizeAliasEmail(raw, accountEmail string) (string, error) {
	return normalizeAliasEmailWithSuffix(raw, accountEmail, "")
}

func normalizeAliasEmailWithSuffix(raw, accountEmail, userSuffix string) (string, error) {
	em := strings.TrimSpace(strings.ToLower(raw))
	if em == "" {
		return "", fmt.Errorf("alias_email requis")
	}
	if strings.Contains(em, "@") {
		return em, nil
	}
	suffix := resolveAliasHostSuffix(userSuffix, accountEmail)
	if suffix == "" {
		return "", fmt.Errorf("alias_email invalide : indiquez une adresse complète (ex. nom@alias.domaine)")
	}
	local := sanitizeAliasLocalPart(em)
	if local == "" {
		return "", fmt.Errorf("partie locale alias invalide")
	}
	return local + "@" + suffix, nil
}

func validateAliasEmailForAccount(em, accountEmail, userSuffix string) error {
	if em == "" || !strings.Contains(em, "@") {
		return fmt.Errorf("alias_email invalide")
	}
	expected := resolveAliasHostSuffix(userSuffix, accountEmail)
	if expected == "" {
		return nil
	}
	_, _, strict := mailAliasConfigFromEnv()
	if !strict && userSuffix == "" {
		return nil
	}
	if !strings.HasSuffix(em, "@"+expected) {
		return fmt.Errorf("l'alias doit se terminer par @%s", expected)
	}
	return nil
}

func (h *Handler) getMailAliasConfig(c *gin.Context) {
	ctx := c.Request.Context()
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	var accountEmail string
	if h.db != nil {
		_ = h.dbex(ctx).QueryRow(`
			SELECT email FROM user_email_accounts
			WHERE user_id = current_setting('app.current_user_id', true)::INTEGER
			ORDER BY id ASC LIMIT 1
		`).Scan(&accountEmail)
	}
	resp, err := h.mailAliasConfigForUser(ctx, userID, accountEmail)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if resp.AliasHostSuffix == "" {
		base := mailAliasConfigResponse()
		resp.PrimaryDomain = base.PrimaryDomain
		if resp.UserAliasHostSuffix == "" {
			resp.AliasHostSuffix = base.AliasHostSuffix
		}
		resp.ValidationStrict = base.ValidationStrict
		resp.EnvConfigured = base.EnvConfigured
	}
	c.JSON(http.StatusOK, resp)
}

func (h *Handler) patchMailAliasConfig(c *gin.Context) {
	ctx := c.Request.Context()
	userID, err := strconv.Atoi(c.GetHeader("X-User-ID"))
	if err != nil || userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "X-User-ID required"})
		return
	}
	var body struct {
		AliasHostSuffix *string `json:"alias_host_suffix"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.AliasHostSuffix == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "alias_host_suffix requis"})
		return
	}
	suffix := strings.TrimPrefix(strings.TrimSpace(strings.ToLower(*body.AliasHostSuffix)), "@")
	if suffix != "" {
		if !strings.Contains(suffix, ".") || strings.ContainsAny(suffix, " @") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "suffixe domaine invalide"})
			return
		}
		_, err = h.dbex(ctx).Exec(`
			INSERT INTO mail_user_alias_prefs (user_id, alias_host_suffix, updated_at)
			VALUES ($1, $2, NOW())
			ON CONFLICT (user_id) DO UPDATE SET alias_host_suffix = EXCLUDED.alias_host_suffix, updated_at = NOW()
		`, userID, suffix)
	} else {
		_, err = h.dbex(ctx).Exec(`DELETE FROM mail_user_alias_prefs WHERE user_id = $1`, userID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	resp, err := h.mailAliasConfigForUser(ctx, userID, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// generateOutboundMessageID produit un Message-ID RFC 5322 (requis par Gmail et autres).
func generateOutboundMessageID(fromEmail string) string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("<%d@cloudity.local>", time.Now().UnixNano())
	}
	domain := "cloudity.local"
	fromEmail = strings.TrimSpace(strings.ToLower(fromEmail))
	if at := strings.LastIndex(fromEmail, "@"); at > 0 && at < len(fromEmail)-1 {
		domain = fromEmail[at+1:]
	}
	return fmt.Sprintf("<%s@%s>", hex.EncodeToString(b[:]), domain)
}
