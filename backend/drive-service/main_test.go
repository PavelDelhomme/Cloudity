package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMimeFromFileName(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{"doc.pdf", "application/pdf"},
		{"X.PDF", "application/pdf"},
		{"a.png", "image/png"},
		{"b.Mp4", "video/mp4"},
		{"noext", ""},
	}
	for _, tc := range tests {
		got := mimeFromFileName(tc.name)
		if got != tc.want {
			t.Errorf("mimeFromFileName(%q) = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestHealth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("health: got %d", w.Code)
	}
}

func TestDriveNodesRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/nodes", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/nodes without X-User-ID: got %d", w.Code)
	}
}

func TestDriveNodesRecentRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/nodes/recent", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/nodes/recent without X-User-ID: got %d", w.Code)
	}
}

func TestGetNodeContentRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/nodes/1/content", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/nodes/1/content without X-User-ID: got %d", w.Code)
	}
}

func TestPutNodeContentRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/drive/nodes/1/content", nil)
	req.Header.Set("Content-Type", "text/plain")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("PUT /drive/nodes/1/content without X-User-ID: got %d", w.Code)
	}
}
