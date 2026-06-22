package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIsPhotosRootFolderName(t *testing.T) {
	tests := []struct {
		name string
		want bool
	}{
		{"Photos", true},
		{" photos ", true},
		{"PHOTOS", true},
		{"Pictures", false},
		{"", false},
	}
	for _, tc := range tests {
		if got := isPhotosRootFolderName(tc.name); got != tc.want {
			t.Errorf("isPhotosRootFolderName(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestPhotosSystemFolderRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/photos/system-folder", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/photos/system-folder without X-User-ID: got %d", w.Code)
	}
}

func TestPhotosSystemFolderNilDB(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/photos/system-folder", nil)
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("GET /drive/photos/system-folder with db=nil: got %d, want 503", w.Code)
	}
}
