package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

func normalizeRsvp(raw string) string {
	s := strings.TrimSpace(strings.ToLower(raw))
	switch s {
	case "accepted", "yes", "oui", "ok":
		return "accepted"
	case "declined", "no", "non":
		return "declined"
	case "tentative", "maybe", "peut-etre", "peut-être":
		return "tentative"
	default:
		return "pending"
	}
}

func parseAttendeeToken(raw string) (email, status string) {
	a := strings.TrimSpace(strings.ToLower(raw))
	if a == "" {
		return "", ""
	}
	status = "pending"
	if i := strings.LastIndex(a, "="); i > 0 {
		status = normalizeRsvp(a[i+1:])
		a = strings.TrimSpace(a[:i])
	}
	if !strings.Contains(a, "@") {
		return "", ""
	}
	return a, status
}

func parseAttendees(s string) ([]string, map[string]string) {
	seen := map[string]bool{}
	var emails []string
	rsvps := map[string]string{}
	for _, p := range strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == ';' || r == '\n'
	}) {
		email, status := parseAttendeeToken(p)
		if email == "" || seen[email] {
			continue
		}
		seen[email] = true
		emails = append(emails, email)
		rsvps[email] = status
	}
	return emails, rsvps
}

func joinAttendeesWithRsvp(list []string, rsvps map[string]string) string {
	seen := map[string]bool{}
	var parts []string
	for _, raw := range list {
		email, status := parseAttendeeToken(raw)
		if email == "" || seen[email] {
			continue
		}
		seen[email] = true
		if rsvps != nil {
			if s, ok := rsvps[email]; ok {
				status = normalizeRsvp(s)
			}
		}
		if status == "" || status == "pending" {
			parts = append(parts, email)
		} else {
			parts = append(parts, email+"="+status)
		}
	}
	return strings.Join(parts, ", ")
}

func (h *Handler) rsvpEvent(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	var body struct {
		Email  string `json:"email"`
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	email, _ := parseAttendeeToken(body.Email)
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email required"})
		return
	}
	status := normalizeRsvp(body.Status)
	if strings.TrimSpace(body.Status) == "" {
		status = "pending"
	}
	if h.db == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "database not configured"})
		return
	}
	ctx := c.Request.Context()
	row := h.dbex(ctx).QueryRow(`SELECT `+eventSelectCols+`
		FROM calendar_events WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
	ev, err := scanEvent(row)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	emails := ev.Attendees
	rsvps := ev.Rsvps
	if rsvps == nil {
		rsvps = map[string]string{}
	}
	found := false
	for _, a := range emails {
		if a == email {
			found = true
			break
		}
	}
	if !found {
		emails = append(emails, email)
	}
	rsvps[email] = status
	stored := joinAttendeesWithRsvp(emails, rsvps)
	res, err := h.dbex(ctx).Exec(`
		UPDATE calendar_events SET attendees = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND user_id = current_setting('app.current_user_id', true)::INTEGER
	`, stored, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	aff, _ := res.RowsAffected()
	if aff == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	row = h.dbex(ctx).QueryRow(`SELECT `+eventSelectCols+`
		FROM calendar_events WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER`, id)
	out, qerr := scanEvent(row)
	if qerr != nil {
		c.JSON(http.StatusOK, gin.H{"id": id, "email": email, "status": status})
		return
	}
	c.JSON(http.StatusOK, out)
}
