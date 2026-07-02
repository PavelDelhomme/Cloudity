package main

import (
	"database/sql"
	"strings"
	"time"
)

// normalizeTimestampString convertit une date PostgreSQL (texte) en RFC3339 UTC pour l’API.
// Les chaînes sans fuseau sont interprétées comme UTC (évite un décalage côté navigateur).
func normalizeTimestampString(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	if t, ok := parseFlexibleTimestamp(s); ok {
		return t.UTC().Format(time.RFC3339)
	}
	return s
}

func parseFlexibleTimestamp(s string) (time.Time, bool) {
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999-07:00",
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05-07:00",
		"2006-01-02 15:04:05-07",
		"2006-01-02 15:04:05.999999",
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05.999999",
		"2006-01-02T15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	if !strings.ContainsAny(s, "Zz+-") {
		normalized := strings.Replace(s, " ", "T", 1)
		if t, err := time.Parse(time.RFC3339, normalized+"Z"); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func applyListedMailTimestamps(m *MailMessage, dateAt, scheduledAt sql.NullString, createdRaw string) {
	if dateAt.Valid {
		m.DateAt = normalizeTimestampString(dateAt.String)
	}
	if scheduledAt.Valid {
		m.ScheduledSendAt = normalizeTimestampString(scheduledAt.String)
	}
	m.CreatedAt = normalizeTimestampString(createdRaw)
}
