// securetoken_hmac.go — Émission / vérification des capability URLs (HMAC).
//
// Voir securetoken_http.go pour les handlers HTTP et docs/securite/URL-CAPABILITIES.md.

package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

const urlTokenWindow = 30 * 24 * time.Hour

const urlTokenHmacBytes = 16

var urlTokenPurposes = map[string]struct{}{
	"settings_security": {},
}

var errInvalidURLToken = errors.New("invalid URL capability token")

func urlTokenSecret() ([]byte, error) {
	if raw := strings.TrimSpace(os.Getenv("URL_TOKEN_SECRET")); raw != "" {
		if b, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(raw, "=")); err == nil && len(b) >= 32 {
			return b, nil
		}
		if b, err := base64.StdEncoding.DecodeString(raw); err == nil && len(b) >= 32 {
			return b, nil
		}
		if len(raw) >= 32 {
			return []byte(raw), nil
		}
		return nil, fmt.Errorf("URL_TOKEN_SECRET trop court (%d oct, attendu >= 32)", len(raw))
	}
	if jwt := strings.TrimSpace(os.Getenv("JWT_SECRET")); jwt != "" {
		h := sha256.Sum256(append([]byte("cloudity-url-tokens-v1:"), jwt...))
		return h[:], nil
	}
	return nil, errors.New("URL_TOKEN_SECRET / JWT_SECRET manquants")
}

func urlTokenEpoch(at time.Time) int64 {
	return at.UnixNano() / int64(urlTokenWindow)
}

func IssueUserPathToken(userID int64, purpose string) (string, error) {
	if _, ok := urlTokenPurposes[purpose]; !ok {
		return "", fmt.Errorf("purpose inconnu : %q", purpose)
	}
	secret, err := urlTokenSecret()
	if err != nil {
		return "", err
	}
	epoch := urlTokenEpoch(time.Now().UTC())
	mac := hmacForToken(secret, userID, purpose, epoch)
	return fmt.Sprintf("%d.%s", epoch, base64.RawURLEncoding.EncodeToString(mac)), nil
}

func VerifyUserPathToken(token string, userID int64, purpose string, now time.Time) error {
	if _, ok := urlTokenPurposes[purpose]; !ok {
		return fmt.Errorf("purpose inconnu : %q", purpose)
	}
	secret, err := urlTokenSecret()
	if err != nil {
		return err
	}
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return errInvalidURLToken
	}
	epoch, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return errInvalidURLToken
	}
	got, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(got) != urlTokenHmacBytes {
		return errInvalidURLToken
	}
	cur := urlTokenEpoch(now.UTC())
	if epoch != cur && epoch != cur-1 {
		return errInvalidURLToken
	}
	want := hmacForToken(secret, userID, purpose, epoch)
	if !hmac.Equal(want, got) {
		return errInvalidURLToken
	}
	return nil
}

func hmacForToken(secret []byte, userID int64, purpose string, epoch int64) []byte {
	mac := hmac.New(sha256.New, secret)
	fmt.Fprintf(mac, "v1:%d:%s:%d", userID, purpose, epoch)
	full := mac.Sum(nil)
	return full[:urlTokenHmacBytes]
}
