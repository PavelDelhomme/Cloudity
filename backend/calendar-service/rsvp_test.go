package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNormalizeRsvp(t *testing.T) {
	if normalizeRsvp("ACCEPTED") != "accepted" || normalizeRsvp("oui") != "accepted" {
		t.Fatal("accepted")
	}
	if normalizeRsvp("declined") != "declined" || normalizeRsvp("non") != "declined" {
		t.Fatal("declined")
	}
	if normalizeRsvp("peut-être") != "tentative" {
		t.Fatal("tentative")
	}
	if normalizeRsvp("") != "pending" {
		t.Fatal("pending")
	}
}

func TestParseJoinAttendeesRsvp(t *testing.T) {
	emails, rsvps := parseAttendees("anne@hubera.cloud=accepted, paul@delhomme.ovh")
	if len(emails) != 2 || emails[0] != "anne@hubera.cloud" {
		t.Fatalf("emails %#v", emails)
	}
	if rsvps["anne@hubera.cloud"] != "accepted" || rsvps["paul@delhomme.ovh"] != "pending" {
		t.Fatalf("rsvps %#v", rsvps)
	}
	got := joinAttendeesWithRsvp(emails, rsvps)
	if !strings.Contains(got, "anne@hubera.cloud=accepted") || !strings.Contains(got, "paul@delhomme.ovh") {
		t.Fatal(got)
	}
	if strings.Contains(got, "paul@delhomme.ovh=") {
		t.Fatal("pending should omit =status", got)
	}
}

func TestRsvpRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/calendar/events/3/rsvp", strings.NewReader(`{"email":"a@b.c","status":"accepted"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("rsvp without user: %d %s", w.Code, w.Body.String())
	}
}

func TestRsvpNoDB(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/calendar/events/3/rsvp", strings.NewReader(`{"email":"a@b.c","status":"accepted"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("rsvp no db: %d %s", w.Code, w.Body.String())
	}
}

func TestRsvpRejectsBadEmail(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/calendar/events/3/rsvp", strings.NewReader(`{"email":"nope","status":"accepted"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest && w.Code != http.StatusServiceUnavailable {
		t.Errorf("bad email: %d %s", w.Code, w.Body.String())
	}
}
