// user_preferences.go — GET/PUT /auth/me/preferences (sync thème, Pass, …).

package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

func (a *AuthService) GetUserPreferences(c *gin.Context) {
	uid, err := a.requireUserIDFromBearer(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	store, ok := a.userStore.(*postgresUserStore)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "preferences require postgres user store"})
		return
	}
	prefs, updatedAt, err := loadUserPreferences(c.Request.Context(), store.db, uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"preferences": prefs,
		"updated_at":  updatedAt,
	})
}

func (a *AuthService) PutUserPreferences(c *gin.Context) {
	uid, err := a.requireUserIDFromBearer(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}
	var body struct {
		Preferences map[string]any `json:"preferences"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Preferences == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "preferences object required"})
		return
	}
	store, ok := a.userStore.(*postgresUserStore)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "preferences require postgres user store"})
		return
	}
	merged, updatedAt, err := mergeUserPreferences(c.Request.Context(), store.db, uid, body.Preferences)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{
		"preferences": merged,
		"updated_at":  updatedAt,
	})
}

func (a *AuthService) requireUserIDFromBearer(c *gin.Context) (string, error) {
	auth := strings.TrimSpace(c.GetHeader("Authorization"))
	if !strings.HasPrefix(auth, "Bearer ") {
		return "", errors.New("missing bearer token")
	}
	claims, err := a.parseAccessToken(strings.TrimPrefix(auth, "Bearer "))
	if err != nil {
		return "", errors.New("invalid token")
	}
	if strings.TrimSpace(claims.UserID) == "" {
		return "", errors.New("invalid user id")
	}
	return claims.UserID, nil
}

func loadUserPreferences(ctx context.Context, db *sql.DB, userID string) (map[string]any, string, error) {
	var raw []byte
	var updatedAt sql.NullTime
	err := db.QueryRowContext(ctx, `
		SELECT prefs, updated_at FROM user_preferences WHERE user_id = $1::int
	`, userID).Scan(&raw, &updatedAt)
	if err == sql.ErrNoRows {
		return map[string]any{}, "", nil
	}
	if err != nil {
		return nil, "", fmt.Errorf("load preferences: %w", err)
	}
	out := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &out); err != nil {
			return nil, "", fmt.Errorf("decode preferences: %w", err)
		}
	}
	ts := ""
	if updatedAt.Valid {
		ts = updatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00")
	}
	return out, ts, nil
}

func mergeUserPreferences(ctx context.Context, db *sql.DB, userID string, patch map[string]any) (map[string]any, string, error) {
	current, _, err := loadUserPreferences(ctx, db, userID)
	if err != nil {
		return nil, "", err
	}
	merged := deepMergeJSON(current, patch)
	raw, err := json.Marshal(merged)
	if err != nil {
		return nil, "", fmt.Errorf("encode preferences: %w", err)
	}
	var updatedAt sql.NullTime
	err = db.QueryRowContext(ctx, `
		INSERT INTO user_preferences (user_id, prefs, updated_at)
		VALUES ($1::int, $2::jsonb, now())
		ON CONFLICT (user_id) DO UPDATE
		SET prefs = EXCLUDED.prefs, updated_at = now()
		RETURNING updated_at
	`, userID, raw).Scan(&updatedAt)
	if err != nil {
		return nil, "", fmt.Errorf("save preferences: %w", err)
	}
	ts := ""
	if updatedAt.Valid {
		ts = updatedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00")
	}
	return merged, ts, nil
}

// deepMergeJSON fusionne patch dans base (objets récursifs ; scalaires/tableaux remplacés).
func deepMergeJSON(base, patch map[string]any) map[string]any {
	if base == nil {
		base = map[string]any{}
	}
	out := make(map[string]any, len(base)+len(patch))
	for k, v := range base {
		out[k] = v
	}
	for k, pv := range patch {
		bv, ok := out[k]
		if !ok {
			out[k] = pv
			continue
		}
		pm, pOk := pv.(map[string]any)
		bm, bOk := bv.(map[string]any)
		if pOk && bOk {
			out[k] = deepMergeJSON(bm, pm)
			continue
		}
		out[k] = pv
	}
	return out
}
