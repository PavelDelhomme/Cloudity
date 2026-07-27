// webauthn_session.go — Stockage Redis des sessions WebAuthn (challenges).
//
// Sécurité :
//   - TTL 5 minutes : les challenges expirent vite pour limiter les rejeux.
//   - Usage unique : la lecture supprime la clé (`Del` après `Get`).
//   - Clé scopée par `user_id` (sessions classiques) ou par `challenge`
//     (discoverable, où on n'a pas l'user_id en main au moment du `begin`).

package webauthn

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	gwebauthn "github.com/go-webauthn/webauthn/webauthn"
)

const sessionTTL = 5 * time.Minute

func sessionKey(userID int64, kind string) string {
	return fmt.Sprintf("webauthn:session:%s:%d", kind, userID)
}

func discoverableSessionKey(challenge string) string {
	return "webauthn:disc-session:" + challenge
}

func (s *Service) storeSession(ctx context.Context, key string, sd *gwebauthn.SessionData) error {
	b, err := json.Marshal(sd)
	if err != nil {
		return err
	}
	return s.rdb.Set(ctx, key, b, sessionTTL).Err()
}

func (s *Service) loadSession(ctx context.Context, key string) (*gwebauthn.SessionData, error) {
	raw, err := s.rdb.Get(ctx, key).Bytes()
	if err != nil {
		return nil, err
	}
	var sd gwebauthn.SessionData
	if err := json.Unmarshal(raw, &sd); err != nil {
		return nil, err
	}
	// Usage unique : suppression dès lecture.
	_ = s.rdb.Del(ctx, key).Err()
	return &sd, nil
}
