package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEmailFromMusicSession_verifiedEmailOnly(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer music-token" {
			http.Error(w, "no", http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"user":{"email":"Owner@Example.com","isGuest":false,"isAdmin":true}}`))
	}))
	defer srv.Close()
	t.Setenv("HUBERA_MUSIC_ME_URL", srv.URL)

	email, err := emailFromMusicSession(context.Background(), "music-token")
	if err != nil {
		t.Fatal(err)
	}
	if email != "owner@example.com" {
		t.Fatalf("email=%q", email)
	}
}

func TestEmailFromMusicSession_rejectsUnsigned(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"user":null}`))
	}))
	defer srv.Close()
	t.Setenv("HUBERA_MUSIC_ME_URL", srv.URL)

	if _, err := emailFromMusicSession(context.Background(), "not-a-music-token"); err == nil {
		t.Fatal("unsigned token should fail")
	}
}

func TestEmailFromMusicSession_rejectsGuest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"user":{"email":"guest@local.ytmusic","isGuest":true}}`))
	}))
	defer srv.Close()
	t.Setenv("HUBERA_MUSIC_ME_URL", srv.URL)

	if _, err := emailFromMusicSession(context.Background(), "guest-token"); err == nil {
		t.Fatal("guest should fail")
	}
}
