package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
)

// MailAliasConfigResponse — config alias exposée au front (GET /mail/me/alias-config).
type MailAliasConfigResponse struct {
	PrimaryDomain    string `json:"primary_domain,omitempty"`
	AliasHostSuffix  string `json:"alias_host_suffix,omitempty"`
	ValidationStrict bool   `json:"validation_strict"`
	EnvConfigured    bool   `json:"env_configured"`
}

func mailAliasConfigFromEnv() (primaryDomain, aliasHostSuffix string, validationStrict bool) {
	primaryDomain = strings.TrimSpace(strings.ToLower(os.Getenv("MAIL_PRIMARY_DOMAIN")))
	aliasHostSuffix = strings.TrimSpace(strings.ToLower(os.Getenv("MAIL_ALIAS_SUBDOMAIN")))
	aliasHostSuffix = strings.TrimPrefix(aliasHostSuffix, "@")
	if aliasHostSuffix == "" && primaryDomain != "" {
		aliasHostSuffix = "alias." + primaryDomain
	}
	validationStrict = primaryDomain != "" || strings.TrimSpace(os.Getenv("MAIL_ALIAS_SUBDOMAIN")) != ""
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

// effectiveAliasHostSuffix — suffixe après @ pour les alias (env, sinon alias.<domaine boîte>).
func effectiveAliasHostSuffix(accountEmail string) string {
	_, suffix, _ := mailAliasConfigFromEnv()
	if suffix != "" {
		return suffix
	}
	if dom := emailDomain(accountEmail); dom != "" {
		return "alias." + dom
	}
	return ""
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
	em := strings.TrimSpace(strings.ToLower(raw))
	if em == "" {
		return "", fmt.Errorf("alias_email requis")
	}
	if strings.Contains(em, "@") {
		return em, nil
	}
	suffix := effectiveAliasHostSuffix(accountEmail)
	if suffix == "" {
		return "", fmt.Errorf("alias_email invalide : indiquez une adresse complète (ex. nom@alias.domaine)")
	}
	local := sanitizeAliasLocalPart(em)
	if local == "" {
		return "", fmt.Errorf("partie locale alias invalide")
	}
	return local + "@" + suffix, nil
}

func validateAliasEmailForAccount(em, accountEmail string) error {
	if em == "" || !strings.Contains(em, "@") {
		return fmt.Errorf("alias_email invalide")
	}
	_, envSuffix, strict := mailAliasConfigFromEnv()
	if !strict {
		return nil
	}
	expected := envSuffix
	if expected == "" {
		expected = effectiveAliasHostSuffix(accountEmail)
	}
	if expected == "" {
		return nil
	}
	if !strings.HasSuffix(em, "@"+expected) {
		return fmt.Errorf("l'alias doit se terminer par @%s", expected)
	}
	return nil
}

func (h *Handler) getMailAliasConfig(c *gin.Context) {
	c.JSON(http.StatusOK, mailAliasConfigResponse())
}
