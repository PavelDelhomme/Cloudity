package main

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPostMobileCrash_AcceptsValidPayload(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MOBILE_CRASH_LOG_DIR", dir)

	handler := NewHandler()
	payload := []byte(`{"crashType":"ManualReport","product":"mail","message":"test crash"}`)
	req := httptest.NewRequest(http.MethodPost, "/mobile/crashes", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("POST /mobile/crashes: got %d, body=%q", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"status":"saved"`) {
		t.Errorf("POST /mobile/crashes: unexpected body %q", w.Body.String())
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read crash dir: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 crash file, got %d", len(entries))
	}
	if !strings.HasPrefix(entries[0].Name(), "crash-") {
		t.Errorf("unexpected filename %q", entries[0].Name())
	}
	body, err := os.ReadFile(filepath.Join(dir, entries[0].Name()))
	if err != nil {
		t.Fatalf("read crash file: %v", err)
	}
	if !strings.Contains(string(body), "ManualReport") {
		t.Errorf("crash file body=%q", string(body))
	}
}

func TestPostMobileCrash_RejectsEmptyBody(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MOBILE_CRASH_LOG_DIR", dir)

	handler := NewHandler()
	req := httptest.NewRequest(http.MethodPost, "/mobile/crashes", bytes.NewReader(nil))
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("POST /mobile/crashes empty: got %d, want 400", w.Code)
	}
}

func TestListMobileCrashes_RequiresAdmin(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MOBILE_CRASH_LOG_DIR", dir)

	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/mobile/crashes", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("GET /mobile/crashes without JWT: got %d, want 401", w.Code)
	}
}
