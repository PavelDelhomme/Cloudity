package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const maxMobileCrashReportBytes = 2 * 1024 * 1024

func mobileCrashLogDir() string {
	if d := strings.TrimSpace(os.Getenv("MOBILE_CRASH_LOG_DIR")); d != "" {
		return d
	}
	return "storage/mobile-crashes"
}

func writeJSONObj(w http.ResponseWriter, status int, v any) {
	b, err := json.Marshal(v)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, `{"error":"encode failed"}`)
		return
	}
	writeJSON(w, status, string(b))
}

func handlePostMobileCrash(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxMobileCrashReportBytes+1))
	defer r.Body.Close()
	if err != nil {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if len(body) > maxMobileCrashReportBytes {
		writeJSONObj(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "payload too large"})
		return
	}
	body = []byte(strings.TrimSpace(string(body)))
	if len(body) == 0 {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "empty body"})
		return
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	dir := mobileCrashLogDir()
	if err := os.MkdirAll(dir, 0o750); err != nil {
		log.Printf("[gateway] mobile-crash mkdir: %v", err)
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "storage unavailable"})
		return
	}
	id := time.Now().UTC().Format("20060102-150405") + "-" + fmt.Sprintf("%06d", time.Now().Nanosecond()/1000)
	name := filepath.Join(dir, "crash-"+id+".json")
	if err := os.WriteFile(name, body, 0o640); err != nil {
		log.Printf("[gateway] mobile-crash write: %v", err)
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "write failed"})
		return
	}
	crashType, _ := parsed["crashType"].(string)
	product, _ := parsed["product"].(string)
	log.Printf("[gateway] mobile-crash saved id=%s type=%q product=%q file=%s", id, crashType, product, name)
	writeJSONObj(w, http.StatusCreated, map[string]string{"id": id, "status": "saved"})
}

func handleListMobileCrashes(w http.ResponseWriter, r *http.Request) {
	if !requireAdminJWT(w, r) {
		return
	}
	dir := mobileCrashLogDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSONObj(w, http.StatusOK, map[string]interface{}{"items": []any{}})
			return
		}
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "read failed"})
		return
	}
	type item struct {
		ID        string    `json:"id"`
		Filename  string    `json:"filename"`
		Modified  time.Time `json:"modified"`
		SizeBytes int64     `json:"sizeBytes"`
	}
	items := make([]item, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasPrefix(e.Name(), "crash-") || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		id := strings.TrimSuffix(strings.TrimPrefix(e.Name(), "crash-"), ".json")
		items = append(items, item{
			ID:        id,
			Filename:  e.Name(),
			Modified:  info.ModTime().UTC(),
			SizeBytes: info.Size(),
		})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Modified.After(items[j].Modified)
	})
	if len(items) > 200 {
		items = items[:200]
	}
	writeJSONObj(w, http.StatusOK, map[string]interface{}{"items": items})
}

func handleGetMobileCrash(w http.ResponseWriter, r *http.Request) {
	if !requireAdminJWT(w, r) {
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" || strings.Contains(id, "..") || strings.Contains(id, "/") {
		writeJSONObj(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	path := filepath.Join(mobileCrashLogDir(), "crash-"+id+".json")
	body, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			writeJSONObj(w, http.StatusNotFound, map[string]string{"error": "not found"})
			return
		}
		writeJSONObj(w, http.StatusInternalServerError, map[string]string{"error": "read failed"})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

func requireAdminJWT(w http.ResponseWriter, r *http.Request) bool {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		writeJSONObj(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return false
	}
	tokenString := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	if tokenString == "" {
		writeJSONObj(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
		return false
	}
	loadPublicKey()
	token, err := jwt.Parse(tokenString, selectKeyForToken)
	if err != nil || token == nil || !token.Valid {
		writeJSONObj(w, http.StatusUnauthorized, map[string]string{"error": "invalid token"})
		return false
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !tokenHasAdminRole(claims) {
		writeJSONObj(w, http.StatusForbidden, map[string]string{"error": "admin role required"})
		return false
	}
	return true
}
