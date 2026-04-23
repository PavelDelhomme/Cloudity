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

func TestPhotosTimelineRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/photos/timeline", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/photos/timeline without X-User-ID: got %d", w.Code)
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

func TestDriveSearchRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/nodes/search?q=doc", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/nodes/search without X-User-ID: got %d", w.Code)
	}
}

func TestDriveSearchBadRequestEmptyQ(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/nodes/search?q=", nil)
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("GET /drive/nodes/search with empty q: got %d, want 400", w.Code)
	}
}

func TestDriveSearchNilDBReturnsEmpty(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/nodes/search?q=hello", nil)
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("GET /drive/nodes/search with db=nil: got %d, want 200", w.Code)
	}
}
