package main

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestMobileOTAUploadAndFetch(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MOBILE_RELEASE_DIR", dir)
	t.Setenv("MOBILE_OTA_PUBLIC_BASE", "https://api.cloudity.test")
	t.Setenv("MOBILE_APK_UPLOAD_TOKEN", "upload-secret")

	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("app", "cloudity_mail")
	_ = w.WriteField("version", "0.2.0")
	part, err := w.CreateFormFile("apk", "cloudity_mail-0.2.0.apk")
	if err != nil {
		t.Fatal(err)
	}
	payload := []byte("fake-apk-bytes")
	if _, err := part.Write(payload); err != nil {
		t.Fatal(err)
	}
	_ = w.Close()

	req := httptest.NewRequest(http.MethodPost, "/admin/mobile/apk/upload", &buf)
	req.Header.Set("Content-Type", w.FormDataContentType())
	req.Header.Set("Authorization", "Bearer upload-secret")
	rr := httptest.NewRecorder()
	handleUploadMobileAPK(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upload: got %d body=%s", rr.Code, rr.Body.String())
	}
	var m mobileOTAManifest
	if err := json.Unmarshal(rr.Body.Bytes(), &m); err != nil {
		t.Fatal(err)
	}
	if m.Version != "0.2.0" || m.App != "cloudity_mail" {
		t.Fatalf("manifest unexpected: %+v", m)
	}
	if m.APKURL != "https://api.cloudity.test/deploy/apk/cloudity_mail/0.2.0" {
		t.Fatalf("apk_url=%q", m.APKURL)
	}
	if _, err := os.Stat(filepath.Join(dir, "apk", "cloudity_mail", "0.2.0.apk")); err != nil {
		t.Fatalf("apk missing: %v", err)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/deploy/mobile/manifest?app=cloudity_mail", nil)
	rr2 := httptest.NewRecorder()
	handleGetMobileOTAManifest(rr2, req2)
	if rr2.Code != http.StatusOK {
		t.Fatalf("manifest get: %d %s", rr2.Code, rr2.Body.String())
	}

	req3 := httptest.NewRequest(http.MethodGet, "/deploy/apk/cloudity_mail/0.2.0", nil)
	rr3 := httptest.NewRecorder()
	handleGetMobileAPK(rr3, req3)
	if rr3.Code != http.StatusOK {
		t.Fatalf("apk get: %d", rr3.Code)
	}
	if !bytes.Equal(rr3.Body.Bytes(), payload) {
		t.Fatalf("apk body mismatch")
	}
}

func TestMobileOTAHeldHidesManifest(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("MOBILE_RELEASE_DIR", dir)
	t.Setenv("MOBILE_APK_UPLOAD_TOKEN", "tok")
	manifestDir := filepath.Join(dir, "manifests")
	_ = os.MkdirAll(manifestDir, 0o750)
	_ = os.WriteFile(filepath.Join(manifestDir, "version-cloudity_drive.json"), []byte(`{
  "app": "cloudity_drive",
  "version": "1.0.0",
  "min_supported": "1.0.0",
  "apk_url": "https://x/deploy/apk/cloudity_drive/1.0.0",
  "sha256": "abc",
  "published_at": "2026-01-01T00:00:00Z",
  "held": true
}`), 0o640)

	req := httptest.NewRequest(http.MethodGet, "/deploy/mobile/manifest?app=cloudity_drive", nil)
	rr := httptest.NewRecorder()
	handleGetMobileOTAManifest(rr, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("held release should be hidden, got %d", rr.Code)
	}
}
