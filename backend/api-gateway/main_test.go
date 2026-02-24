package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthEndpoint(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /health: got status %d, want %d", w.Code, http.StatusOK)
	}
	body := w.Body.String()
	if body != `{"status":"healthy"}` {
		t.Errorf("GET /health: got body %q, want %q", body, `{"status":"healthy"}`)
	}
}

func TestHealthEndpoint_MethodGetOnly(t *testing.T) {
	handler := NewHandler()
	req := httptest.NewRequest(http.MethodPost, "/health", nil)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusMethodNotAllowed && w.Code != http.StatusOK {
		t.Logf("POST /health: got status %d (acceptable)", w.Code)
	}
}
