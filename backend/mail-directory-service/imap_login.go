package main

import (
	"context"
	"errors"
	"log"
	"strconv"
	"strings"

	"github.com/emersion/go-imap/client"
	"github.com/emersion/go-sasl"
)

// imapLoginPassword authentifie sur IMAP : AUTH PLAIN si annoncé (meilleure tolérance mots de passe « spéciaux »),
// sinon LOGIN RFC 3501. Après un PLAIN refusé, on retente LOGIN sur la même connexion (état non authentifié).
func imapLoginPassword(c *client.Client, email, password string) error {
	plainOK, err := c.SupportAuth("PLAIN")
	if err != nil {
		plainOK = false
	}
	if plainOK {
		if err := c.Authenticate(sasl.NewPlainClient("", email, password)); err == nil {
			return nil
		}
	}
	return c.Login(email, password)
}

func isOvhHostedEmail(email string) bool {
	lower := strings.TrimSpace(strings.ToLower(email))
	return strings.Contains(lower, "@ovh.") || strings.Contains(lower, ".ovh")
}

// imapDialAndLoginOVHFailover ouvre TLS (993) ou TCP, authentifie avec imapLoginPassword.
// Pour les adresses OVH dont l’hôte déduit est ssl0.ovh.net, retente imap.mail.ovh.net après un refus d’identifiants
// (certaines offres / migrations utilisent ce cluster).
func imapDialAndLoginOVHFailover(email, password, host string, port int) (*client.Client, string, error) {
	hTrim := strings.TrimSpace(host)
	hosts := []string{hTrim}
	if isOvhHostedEmail(email) && strings.EqualFold(hTrim, "ssl0.ovh.net") {
		hosts = append(hosts, "imap.mail.ovh.net")
	}
	var lastErr error
	for _, h := range hosts {
		dialPort := port
		if dialPort <= 0 {
			dialPort = 993
		}
		addr := h + ":" + strconv.Itoa(dialPort)
		var c *client.Client
		var err error
		if dialPort == 993 || port <= 0 {
			c, err = client.DialTLS(addr, nil)
		} else {
			c, err = client.Dial(addr)
		}
		if err != nil {
			lastErr = err
			continue
		}
		if err := imapLoginPassword(c, email, password); err != nil {
			_ = c.Logout()
			lastErr = err
			continue
		}
		return c, h, nil
	}
	if lastErr == nil {
		lastErr = errors.New("imap: aucune connexion réussie")
	}
	return nil, "", lastErr
}

// persistAccountPasswordAfterSync enregistre le mot de passe IMAP qui vient de fonctionner (sync manuelle ou auto).
func (h *Handler) persistAccountPasswordAfterSync(ctx context.Context, accountID, userID int, plainPassword string) bool {
	if plainPassword == "" || userID <= 0 || accountID <= 0 {
		return false
	}
	encStr, encErr := encryptPassword(plainPassword)
	if encErr != nil || encStr == "" {
		log.Printf("[mail] sync account=%d: impossible de chiffrer le mot de passe: %v", accountID, encErr)
		return false
	}
	// Transaction courte : évite les « connection reset by peer » Postgres lors d'un Close() brutal sur conn pool.
	tx, err := h.db.BeginTx(ctx, nil)
	if err != nil {
		log.Printf("[mail] sync account=%d: persist tx: %v", accountID, err)
		return false
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(ctx, "SELECT set_config('app.current_user_id', $1, true)", strconv.Itoa(userID)); err != nil {
		log.Printf("[mail] sync account=%d: persist set_config: %v", accountID, err)
		return false
	}
	res, err := tx.ExecContext(ctx, `
		UPDATE user_email_accounts SET password_encrypted = $1, updated_at = NOW()
		WHERE id = $2 AND user_id = $3
	`, encStr, accountID, userID)
	if err != nil {
		log.Printf("[mail] sync account=%d: persist password_encrypted: %v", accountID, err)
		return false
	}
	if err := tx.Commit(); err != nil {
		log.Printf("[mail] sync account=%d: persist commit: %v", accountID, err)
		return false
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		log.Printf("[mail] sync account=%d: persist password — aucune ligne (user_id=%d)", accountID, userID)
		return false
	}
	log.Printf("[mail] sync account=%d: mot de passe IMAP enregistré (chiffré)", accountID)
	return true
}

// persistAccountImapHostAfterSync mémorise l'hôte IMAP qui a accepté la connexion (ex. failover ssl0 → imap.mail.ovh.net).
func (h *Handler) persistAccountImapHostAfterSync(ctx context.Context, accountID, userID int, imapHost string, imapPort int) bool {
	hTrim := strings.TrimSpace(imapHost)
	if hTrim == "" || userID <= 0 || accountID <= 0 {
		return false
	}
	if imapPort <= 0 {
		imapPort = 993
	}
	res, err := h.dbex(ctx).Exec(`
		UPDATE user_email_accounts SET imap_host = $1, imap_port = $2, updated_at = NOW()
		WHERE id = $3 AND user_id = $4
	`, hTrim, imapPort, accountID, userID)
	if err != nil {
		log.Printf("[mail] sync account=%d: persist imap_host: %v", accountID, err)
		return false
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return false
	}
	log.Printf("[mail] sync account=%d: hôte IMAP enregistré → %s:%d", accountID, hTrim, imapPort)
	return true
}
