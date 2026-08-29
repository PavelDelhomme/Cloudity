package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const maxMobileAPKBytes = 256 * 1024 * 1024 // 256 MiB (Photos debug APK ~212 MiB)

var mobileAppSlugRe = regexp.MustCompile(`^[a-z][a-z0-9_]{1,64}$`)
var mobileVersionRe = regexp.MustCompile(`^[0-9]+(\.[0-9]+){0,3}([-+][A-Za-z0-9._-]+)?$`)

type mobileOTAManifest struct {
	App          string `json:"app"`
	Version      string `json:"version"`
	MinSupported string `json:"min_supported"`
	APKURL       string `json:"apk_url"`
	SHA256       string `json:"sha256"`
	PublishedAt  string `json:"published_at"`
	Held         bool   `json:"held,omitempty"`
}

func mobileReleaseDir() string {
	if d := strings.TrimSpace(os.Getenv("MOBILE_RELEASE_DIR")); d != "" {
		return d
	}
	return "storage/mobile-releases"
}

func mobileOTAPublicBase() string {
	if b := strings.TrimSpace(os.Getenv("MOBILE_OTA_PUBLIC_BASE")); b != "" {
		return strings.TrimRight(b, "/")
	}
	if host := strings.TrimSpace(os.Getenv("CLOUDITY_PUBLIC_API_HOST")); host != "" {
		proto := strings.TrimSpace(os.Getenv("CLOUDITY_PUBLIC_PROTO"))
		if proto == "" {
			proto = "https"
		}
		return fmt.Sprintf("%s://%s", proto, host)
	}
	return ""
}

func sanitizeMobileApp(app string) (string, bool) {
	app = strings.TrimSpace(strings.ToLower(app))
	app = strings.ReplaceAll(app, "-", "_")
	if !mobileAppSlugRe.MatchString(app) {
		return "", false
	}
	return app, true
}

func sanitizeMobileVersion(v string) (string, bool) {
	v = strings.TrimSpace(v)
	if !mobileVersionRe.MatchString(v) {
		return "", false
	}
	return v, true
}

func mobileManifestPath(app string) string {
	return filepath.Join(mobileReleaseDir(), "manifests", "version-"+app+".json")
}

func mobileAPKPath(app, version string) string {
	return filepath.Join(mobileReleaseDir(), "apk", app, version+".apk")
}

func readMobileManifest(app string) (*mobileOTAManifest, error) {
	b, err := os.ReadFile(mobileManifestPath(app))
	if err != nil {
		return nil, err
	}
	var m mobileOTAManifest
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return &m, nil
}

func writeMobileManifest(m *mobileOTAManifest) error {
	dir := filepath.Dir(mobileManifestPath(m.App))
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(mobileManifestPath(m.App), append(b, '\n'), 0o640)
}

func handleGetMobileOTAManifest(w http.ResponseWriter, r *http.Request) {
	app, ok := sanitizeMobileApp(r.URL.Query().Get("app"))
	if !ok {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid or missing app"})
		return
	}
	m, err := readMobileManifest(app)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSONObj(w, http.StatusNotFound, map[string]string{"error": "no release for app"})
			return
		}
		log.Printf("[gateway] mobile-ota read manifest: %v", err)
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "read failed"})
		return
	}
	if m.Held {
		writeJSONObj(w, http.StatusNotFound, map[string]string{"error": "release held"})
		return
	}
	writeJSONObj(w, http.StatusOK, m)
}

func handleGetMobileAPK(w http.ResponseWriter, r *http.Request) {
	// Paths: /deploy/apk/{app} ou /deploy/apk/{app}/{version}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/deploy/apk"), "/"), "/")
	if len(parts) < 1 || parts[0] == "" {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "missing app"})
		return
	}
	app, ok := sanitizeMobileApp(parts[0])
	if !ok {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid app"})
		return
	}
	version := ""
	if len(parts) >= 2 {
		version, ok = sanitizeMobileVersion(parts[1])
		if !ok {
			writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid version"})
			return
		}
	} else {
		m, err := readMobileManifest(app)
		if err != nil || m == nil || m.Held {
			writeJSONObj(w, http.StatusNotFound, map[string]string{"error": "no release for app"})
			return
		}
		version = m.Version
	}
	path := mobileAPKPath(app, version)
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSONObj(w, http.StatusNotFound, map[string]string{"error": "apk not found"})
			return
		}
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "open failed"})
		return
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "stat failed"})
		return
	}
	w.Header().Set("Content-Type", "application/vnd.android.package-archive")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s-%s.apk"`, app, version))
	w.Header().Set("Cache-Control", "public, max-age=300")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, filepath.Base(path), st.ModTime(), f)
}

func mobileUploadTokenOK(r *http.Request) bool {
	expected := strings.TrimSpace(os.Getenv("MOBILE_APK_UPLOAD_TOKEN"))
	if expected == "" {
		expected = strings.TrimSpace(os.Getenv("APK_UPLOAD_TOKEN"))
	}
	if expected == "" {
		return false
	}
	auth := strings.TrimSpace(r.Header.Get("Authorization"))
	token := strings.TrimSpace(strings.TrimPrefix(auth, "Bearer "))
	return token != "" && token == expected
}

func handleUploadMobileAPK(w http.ResponseWriter, r *http.Request) {
	// Auth : token CI dédié OU JWT admin (déjà passé le middleware si /admin).
	if !mobileUploadTokenOK(r) && !requireAdminJWT(w, r) {
		return
	}
	if err := r.ParseMultipartForm(maxMobileAPKBytes + 1024*1024); err != nil {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid multipart"})
		return
	}
	app, ok := sanitizeMobileApp(r.FormValue("app"))
	if !ok {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid app"})
		return
	}
	version, ok := sanitizeMobileVersion(r.FormValue("version"))
	if !ok {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid version"})
		return
	}
	minSupported := strings.TrimSpace(r.FormValue("min_supported"))
	if minSupported == "" {
		minSupported = version
	} else if _, ok := sanitizeMobileVersion(minSupported); !ok {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid min_supported"})
		return
	}
	file, header, err := r.FormFile("apk")
	if err != nil {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "apk file required"})
		return
	}
	defer file.Close()
	if header.Size > maxMobileAPKBytes {
		writeJSONObj(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "apk too large"})
		return
	}

	apkDir := filepath.Join(mobileReleaseDir(), "apk", app)
	if err := os.MkdirAll(apkDir, 0o750); err != nil {
		log.Printf("[gateway] mobile-ota mkdir: %v", err)
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "storage unavailable"})
		return
	}
	dest := mobileAPKPath(app, version)
	tmp := dest + ".tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "write failed"})
		return
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(out, h), io.LimitReader(file, maxMobileAPKBytes+1))
	_ = out.Close()
	if err != nil || n > maxMobileAPKBytes {
		_ = os.Remove(tmp)
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "apk copy failed or too large"})
		return
	}
	if err := os.Rename(tmp, dest); err != nil {
		_ = os.Remove(tmp)
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "rename failed"})
		return
	}
	sum := hex.EncodeToString(h.Sum(nil))
	base := mobileOTAPublicBase()
	apkURL := fmt.Sprintf("%s/deploy/apk/%s/%s", base, app, version)
	if base == "" {
		apkURL = fmt.Sprintf("/deploy/apk/%s/%s", app, version)
	}
	m := &mobileOTAManifest{
		App:          app,
		Version:      version,
		MinSupported: minSupported,
		APKURL:       apkURL,
		SHA256:       sum,
		PublishedAt:  time.Now().UTC().Format(time.RFC3339),
		Held:         false,
	}
	if err := writeMobileManifest(m); err != nil {
		log.Printf("[gateway] mobile-ota write manifest: %v", err)
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "manifest write failed"})
		return
	}
	log.Printf("[gateway] mobile-ota published app=%s version=%s sha256=%s", app, version, sum[:12])
	writeJSONObj(w, http.StatusCreated, m)
}

func knownMobileOTAApps() []string {
	return []string{
		"cloudity_mail",
		"cloudity_drive",
		"cloudity_photos",
		"cloudity_pass",
		"cloudity_calendar",
		"cloudity_contacts",
		"cloudity_notes",
		"cloudity_tasks",
		"cloudity_admin",
	}
}

func handleListMobileReleases(w http.ResponseWriter, r *http.Request) {
	if !requireAdminJWT(w, r) {
		return
	}
	type entry struct {
		App      string             `json:"app"`
		Label    string             `json:"label"`
		Release  *mobileOTAManifest `json:"release"`
		HasAPK   bool               `json:"has_apk"`
		Manifest string             `json:"manifest_path"`
	}
	labels := map[string]string{
		"cloudity_mail":     "Mail",
		"cloudity_drive":    "Drive",
		"cloudity_photos":   "Photos",
		"cloudity_pass":     "Pass",
		"cloudity_calendar": "Agenda",
		"cloudity_contacts": "Contacts",
		"cloudity_notes":    "Notes",
		"cloudity_tasks":    "Tâches",
		"cloudity_admin":    "Admin",
	}
	seen := map[string]bool{}
	out := make([]entry, 0, 16)
	for _, app := range knownMobileOTAApps() {
		seen[app] = true
		e := entry{
			App:      app,
			Label:    labels[app],
			Manifest: "version-" + app + ".json",
		}
		if m, err := readMobileManifest(app); err == nil {
			e.Release = m
			if _, err := os.Stat(mobileAPKPath(app, m.Version)); err == nil {
				e.HasAPK = true
			}
		}
		out = append(out, e)
	}
	// Manifestes hors catalogue (legacy)
	manDir := filepath.Join(mobileReleaseDir(), "manifests")
	if ents, err := os.ReadDir(manDir); err == nil {
		for _, ent := range ents {
			name := ent.Name()
			if !strings.HasPrefix(name, "version-") || !strings.HasSuffix(name, ".json") {
				continue
			}
			app := strings.TrimSuffix(strings.TrimPrefix(name, "version-"), ".json")
			if seen[app] {
				continue
			}
			e := entry{App: app, Label: app, Manifest: name}
			if m, err := readMobileManifest(app); err == nil {
				e.Release = m
				if _, err := os.Stat(mobileAPKPath(app, m.Version)); err == nil {
					e.HasAPK = true
				}
			}
			out = append(out, e)
		}
	}
	base := mobileOTAPublicBase()
	writeJSONObj(w, http.StatusOK, map[string]any{
		"releases":    out,
		"public_base": base,
		"upload_path": "/admin/mobile/apk/upload",
		"hold_path":   "/admin/mobile/apk/hold",
		"hint":        "Web/backends : push branche prod → GHCR → GitOps/Watchtower. Mobile : upload APK ici ou make mobile-upload-apk APP=…",
	})
}

func handleHoldMobileRelease(w http.ResponseWriter, r *http.Request) {
	if !requireAdminJWT(w, r) {
		return
	}
	app, ok := sanitizeMobileApp(r.URL.Query().Get("app"))
	if !ok {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid app"})
		return
	}
	m, err := readMobileManifest(app)
	if err != nil {
		writeJSONObj(w, http.StatusNotFound, map[string]string{"error": "no release"})
		return
	}
	held := strings.EqualFold(r.URL.Query().Get("held"), "true") || r.URL.Query().Get("held") == "1"
	m.Held = held
	if err := writeMobileManifest(m); err != nil {
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "write failed"})
		return
	}
	writeJSONObj(w, http.StatusOK, m)
}
