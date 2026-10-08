package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMapsSourceKey(t *testing.T) {
	if mapsSourceKey("42", "") != "maps:trip:42" {
		t.Fatalf("trip id: %s", mapsSourceKey("42", ""))
	}
	if mapsSourceKey("", "maps:trip:9") != "maps:trip:9" {
		t.Fatalf("explicit: %s", mapsSourceKey("", "maps:trip:9"))
	}
	if mapsSourceKey("", "abc") != "maps:abc" {
		t.Fatalf("prefix: %s", mapsSourceKey("", "abc"))
	}
	if mapsSourceKey("", "") != "" {
		t.Fatal("empty should be empty")
	}
}

func TestTestTripTitle(t *testing.T) {
	if testTripTitle("Lyon → Paris") != "[TEST] Lyon → Paris" {
		t.Fatal(testTripTitle("Lyon → Paris"))
	}
	if testTripTitle("[TEST] déjà") != "[TEST] déjà" {
		t.Fatal(testTripTitle("[TEST] déjà"))
	}
	if !strings.HasPrefix(testTripTitle(""), "[TEST]") {
		t.Fatal(testTripTitle(""))
	}
}

func TestNormalizeRepeat(t *testing.T) {
	if normalizeRepeat("daily") != "daily" || normalizeRepeat("WEEKLY") != "weekly" {
		t.Fatal("daily/weekly")
	}
	if normalizeRepeat("monthly") != "monthly" {
		t.Fatal("monthly")
	}
	if normalizeRepeat("yearly") != nil || normalizeRepeat("") != nil {
		t.Fatal("unknown")
	}
}

func TestFromMapsRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/calendar/events/from-maps", strings.NewReader(`{"trip_id":"1","start_at":"2026-10-08T08:00:00Z"}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("from-maps without X-User-ID: got %d", w.Code)
	}
}

func TestFromMapsAcceptsRepeatPayload(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/calendar/events/from-maps", strings.NewReader(
		`{"trip_id":"42","start_at":"2026-10-08T08:00:00Z","repeat_rule":"weekly"}`,
	))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable && w.Code != http.StatusCreated && w.Code != http.StatusOK {
		t.Errorf("from-maps weekly: got %d body %s", w.Code, w.Body.String())
	}
}

func TestFromMapsRequiresTrip(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/calendar/events/from-maps", strings.NewReader(`{"title":"x","start_at":"2026-10-08T08:00:00Z"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable && w.Code != http.StatusBadRequest {
		t.Errorf("from-maps empty trip: got %d body %s", w.Code, w.Body.String())
	}
}
