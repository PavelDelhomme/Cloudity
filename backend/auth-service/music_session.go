package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// musicSessionEndpoint est l’URL que Music expose pour dire si un Bearer
// est un jeton qu’il a lui-même signé. Le payload non vérifié n’est jamais lu.
func musicSessionEndpoint() string {
	if v := strings.TrimSpace(os.Getenv("HUBERA_MUSIC_ME_URL")); v != "" {
		return v
	}
	return "https://music.hubera.cloud/api/auth/me"
}

// emailFromMusicSession demande à Music de vérifier le jeton déjà présent.
// Seul l’e-mail renvoyé par Music, après sa propre signature, est gardé.
func emailFromMusicSession(ctx context.Context, accessToken string) (string, error) {
	accessToken = strings.TrimSpace(accessToken)
	if accessToken == "" {
		return "", fmt.Errorf("music session empty")
	}
	endpoint := musicSessionEndpoint()
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" {
		return "", fmt.Errorf("music session url")
	}
	local := parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "localhost"
	if parsed.Scheme != "https" && !(parsed.Scheme == "http" && local) {
		return "", fmt.Errorf("music session url")
	}
	callCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(callCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	client := &http.Client{
		Timeout: 6 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	res, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("music session unreachable")
	}
	defer res.Body.Close()
	body, err := io.ReadAll(io.LimitReader(res.Body, 8192))
	if err != nil {
		return "", fmt.Errorf("music session body")
	}
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("music session status %d", res.StatusCode)
	}
	var payload struct {
		User *struct {
			Email   string `json:"email"`
			IsGuest bool   `json:"isGuest"`
		} `json:"user"`
	}
	if err := json.Unmarshal(body, &payload); err != nil || payload.User == nil {
		return "", fmt.Errorf("music session unsigned")
	}
	if payload.User.IsGuest {
		return "", fmt.Errorf("music session guest")
	}
	email := normalizeAuthEmail(payload.User.Email)
	if email == "" || !strings.Contains(email, "@") {
		return "", fmt.Errorf("music session unsigned")
	}
	return email, nil
}
