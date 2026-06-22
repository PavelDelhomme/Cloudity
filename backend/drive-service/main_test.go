package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
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
		{"photo.HEIC", "image/heic"},
		{"photo.heif", "image/heif"},
		{"photo.avif", "image/avif"},
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

func TestIsNonPhotoThumbnail(t *testing.T) {
	if !isNonPhotoThumbnail("scan.pdf", "application/pdf") {
		t.Fatal("expected pdf to be non-photo thumbnail")
	}
	if isNonPhotoThumbnail("photo.jpg", "image/jpeg") {
		t.Fatal("expected jpg to be photo thumbnail")
	}
}

func TestPhotoTakenAtFromFileName(t *testing.T) {
	tests := []struct {
		name string
		want string
	}{
		{"IMG_20240521_143015.jpg", "2024-05-21T14:30:15Z"},
		{"PXL_20231201_081122123.jpg", "2023-12-01T08:11:22Z"},
		{"Screenshot_2026-05-21-220001.png", "2026-05-21T22:00:01Z"},
	}
	for _, tc := range tests {
		got, ok := photoTakenAtFromFileName(tc.name)
		if !ok {
			t.Fatalf("photoTakenAtFromFileName(%q) was not detected", tc.name)
		}
		if got.Format("2006-01-02T15:04:05Z") != tc.want {
			t.Errorf("photoTakenAtFromFileName(%q) = %s, want %s", tc.name, got.Format("2006-01-02T15:04:05Z"), tc.want)
		}
	}
	if _, ok := photoTakenAtFromFileName("photo.jpg"); ok {
		t.Fatal("photoTakenAtFromFileName detected a date in a plain file name")
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

func TestPhotosArchiveRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/photos/archive", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/photos/archive without X-User-ID: got %d", w.Code)
	}
}

func TestPhotosLockedRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/photos/locked", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/photos/locked without X-User-ID: got %d", w.Code)
	}
}

func TestPhotosArchiveMutationRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/drive/photos/archive", strings.NewReader(`{"ids":[1]}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("POST /drive/photos/archive without X-User-ID: got %d", w.Code)
	}
}

func TestPhotosLockMutationRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/drive/photos/lock", strings.NewReader(`{"ids":[1]}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("POST /drive/photos/lock without X-User-ID: got %d", w.Code)
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

func TestStorageSummaryRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/storage/summary", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/storage/summary without X-User-ID: got %d", w.Code)
	}
}

func TestPhotosFingerprintsRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/photos/fingerprints", nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("GET /drive/photos/fingerprints without X-User-ID: got %d", w.Code)
	}
}

func TestPhotosMatchRequiresAuth(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/drive/photos/match", strings.NewReader(`{"items":[{"name":"a.jpg","size":1}]}`))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Errorf("POST /drive/photos/match without X-User-ID: got %d", w.Code)
	}
}

func TestStorageSummaryNilDBReturnsZeros(t *testing.T) {
	r := setupRouter(nil)
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/drive/storage/summary", nil)
	req.Header.Set("X-User-ID", "1")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("GET /drive/storage/summary with db=nil: got %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), `"photos"`) {
		t.Errorf("expected photos key in body, got %s", w.Body.String())
	}
}
