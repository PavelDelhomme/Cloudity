package main

import (
	"context"
	"database/sql"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const eventSelectCols = `id, tenant_id, user_id, calendar_id, title, start_at::text, end_at::text, all_day, location, description, repeat_rule, COALESCE(attendees, ''), reminder_minutes, COALESCE(source_key, ''), created_at::text, COALESCE(updated_at::text, '')`

func ensureCalendarSchema(db *sql.DB) {
	if db == nil {
		return
	}
	for _, s := range []string{
		`ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS attendees TEXT`,
		`ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER`,
		`ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS source_key TEXT`,
		`CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_user_source_key ON calendar_events (user_id, source_key) WHERE source_key IS NOT NULL AND btrim(source_key) <> ''`,
	} {
		if _, err := db.Exec(s); err != nil {
			log.Printf("calendar schema: %v", err)
		}
	}
}

func mapsSourceKey(tripID, explicit string) string {
	s := strings.TrimSpace(explicit)
	if s != "" {
		if !strings.HasPrefix(s, "maps:") {
			s = "maps:" + s
		}
		if len(s) > 200 {
			s = s[:200]
		}
		return s
	}
	id := strings.TrimSpace(tripID)
	if id == "" {
		return ""
	}
	key := "maps:trip:" + id
	if len(key) > 200 {
		key = key[:200]
	}
	return key
}

func testTripTitle(title string) string {
	t := strings.TrimSpace(title)
	if t == "" {
		t = "Trajet Hubera Maps"
	}
	if strings.HasPrefix(strings.ToUpper(t), "[TEST]") {
		return t
	}
	return "[TEST] " + t
}

func normalizeRepeat(raw string) any {
	s := strings.TrimSpace(strings.ToLower(raw))
	switch s {
	case "daily", "weekdays", "weekly", "monthly":
		return s
	default:
		return nil
	}
}

func applyEventNulls(e *Event, loc, desc, rr, att, sk sql.NullString, cal sql.NullInt64, remind sql.NullInt64, uat string) {
	if cal.Valid {
		v := int(cal.Int64)
		e.CalendarID = &v
	}
	if loc.Valid {
		e.Location = &loc.String
	}
	if desc.Valid {
		e.Description = &desc.String
	}
	if rr.Valid && strings.TrimSpace(rr.String) != "" {
		s := strings.TrimSpace(rr.String)
		e.RepeatRule = &s
	}
	emails, rsvps := parseAttendees(att.String)
	e.Attendees = emails
	if len(rsvps) > 0 {
		e.Rsvps = rsvps
	}
	if remind.Valid {
		v := int(remind.Int64)
		e.ReminderMinutes = &v
	}
	if sk.Valid && strings.TrimSpace(sk.String) != "" {
		s := strings.TrimSpace(sk.String)
		e.SourceKey = &s
	}
	e.UpdatedAt = uat
}

func scanEvent(scanner interface{ Scan(dest ...any) error }) (Event, error) {
	var e Event
	var loc, desc, rr, att, sk sql.NullString
	var cal sql.NullInt64
	var remind sql.NullInt64
	var uat string
	err := scanner.Scan(&e.ID, &e.TenantID, &e.UserID, &cal, &e.Title, &e.StartAt, &e.EndAt, &e.AllDay, &loc, &desc, &rr, &att, &remind, &sk, &e.CreatedAt, &uat)
	if err != nil {
		return e, err
	}
	applyEventNulls(&e, loc, desc, rr, att, sk, cal, remind, uat)
	return e, nil
}

func tenantFromHeader(c *gin.Context) int {
	tenantID := 1
	if t := c.GetHeader("X-Tenant-ID"); t != "" {
		if tid, err := strconv.Atoi(t); err == nil && tid > 0 {
			tenantID = tid
		}
	}
	return tenantID
}

func (h *Handler) loadEventBySourceKey(ctx context.Context, key string) (Event, bool, error) {
	var e Event
	if h.db == nil || strings.TrimSpace(key) == "" {
		return e, false, nil
	}
	row := h.dbex(ctx).QueryRow(`SELECT `+eventSelectCols+`
		FROM calendar_events
		WHERE user_id = current_setting('app.current_user_id', true)::INTEGER AND source_key = $1`, key)
	ev, err := scanEvent(row)
	if err == sql.ErrNoRows {
		return e, false, nil
	}
	if err != nil {
		return e, false, err
	}
	return ev, true, nil
}

func (h *Handler) fromMaps(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	var body struct {
		TripID      string  `json:"trip_id"`
		SourceKey   string  `json:"source_key"`
		Title       string  `json:"title"`
		StartAt     string  `json:"start_at"`
		EndAt       string  `json:"end_at"`
		Location    *string `json:"location"`
		Description *string `json:"description"`
		RepeatRule  *string `json:"repeat_rule"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	key := mapsSourceKey(body.TripID, body.SourceKey)
	if key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "trip_id required"})
		return
	}
	if strings.TrimSpace(body.StartAt) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "start_at required"})
		return
	}
	endAt := strings.TrimSpace(body.EndAt)
	if endAt == "" {
		endAt = body.StartAt
	}
	title := testTripTitle(body.Title)
	rr := any(nil)
	if body.RepeatRule != nil {
		rr = normalizeRepeat(*body.RepeatRule)
	}
	userID, _ := strconv.Atoi(c.GetHeader("X-User-ID"))
	tenantID := tenantFromHeader(c)
	ctx := c.Request.Context()
	existing, ok, err := h.loadEventBySourceKey(ctx, key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if ok {
		_, err = h.dbex(ctx).Exec(`
			UPDATE calendar_events SET
				title = $1,
				start_at = $2::timestamptz,
				end_at = $3::timestamptz,
				location = COALESCE($4, location),
				description = COALESCE($5, description),
				repeat_rule = CASE WHEN $7::boolean THEN $8::varchar ELSE repeat_rule END,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = $6 AND user_id = current_setting('app.current_user_id', true)::INTEGER
		`, title, body.StartAt, endAt, body.Location, body.Description, existing.ID, body.RepeatRule != nil, rr)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		row := h.dbex(ctx).QueryRow(`SELECT `+eventSelectCols+` FROM calendar_events WHERE id = $1`, existing.ID)
		ev, scanErr := scanEvent(row)
		if scanErr != nil {
			c.JSON(http.StatusOK, gin.H{"id": existing.ID, "created": false, "source_key": key})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": ev.ID, "created": false, "event": ev, "source_key": key})
		return
	}
	calID, err := h.ensureDefaultCalendar(ctx, userID, tenantID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	desc := body.Description
	if desc == nil {
		s := "Trajet Hubera Maps · " + key
		desc = &s
	}
	var id int
	err = h.dbex(ctx).QueryRow(`
		INSERT INTO calendar_events (tenant_id, user_id, calendar_id, title, start_at, end_at, all_day, location, description, source_key, repeat_rule)
		VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, false, $7, $8, $9, $10) RETURNING id
	`, tenantID, userID, calID, title, body.StartAt, endAt, body.Location, desc, key, rr).Scan(&id)
	if err != nil {
		// Course unique : un concurrent a pu inserer la meme cle.
		existing, ok, _ = h.loadEventBySourceKey(ctx, key)
		if ok {
			c.JSON(http.StatusOK, gin.H{"id": existing.ID, "created": false, "event": existing, "source_key": key})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id, "created": true, "title": title, "source_key": key, "calendar_id": calID})
}
