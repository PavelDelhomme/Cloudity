package main

import (
	"testing"
)

func TestNormalizePhotoFileName(t *testing.T) {
	if got := normalizePhotoFileName(" IMG.JPG "); got != "img.jpg" {
		t.Fatalf("normalizePhotoFileName = %q", got)
	}
}

func TestPickPhotoMatchContentHash(t *testing.T) {
	byHash := map[string][]photoCloudEntry{
		"abc123": {{id: 42, name: "a.jpg", size: 100, contentHash: "abc123"}},
	}
	got := pickPhotoMatch(
		photoMatchCandidate{Name: "other.jpg", Size: 1, ContentHash: "abc123"},
		byHash,
		map[string][]photoCloudEntry{},
		map[int]bool{},
	)
	if got == nil || got.id != 42 || got.matchedBy != "content_hash" {
		t.Fatalf("expected hash match, got %+v", got)
	}
}

func TestPickPhotoMatchNameSize(t *testing.T) {
	byNameSize := map[string][]photoCloudEntry{
		"vacances.jpg|2048": {{id: 7, name: "Vacances.jpg", size: 2048}},
	}
	got := pickPhotoMatch(
		photoMatchCandidate{Name: "vacances.jpg", Size: 2048},
		map[string][]photoCloudEntry{},
		byNameSize,
		map[int]bool{},
	)
	if got == nil || got.id != 7 || got.matchedBy != "name_size" {
		t.Fatalf("expected name_size match, got %+v", got)
	}
}

func TestPickPhotoMatchSkipsUsed(t *testing.T) {
	byNameSize := map[string][]photoCloudEntry{
		"a.jpg|10": {{id: 1, name: "a.jpg", size: 10}},
	}
	used := map[int]bool{1: true}
	if got := pickPhotoMatch(
		photoMatchCandidate{Name: "a.jpg", Size: 10},
		map[string][]photoCloudEntry{},
		byNameSize,
		used,
	); got != nil {
		t.Fatalf("expected nil when already used, got %+v", got)
	}
}

func TestSha256HexContent(t *testing.T) {
	got := sha256HexContent([]byte("cloudity"))
	if len(got) != 64 {
		t.Fatalf("expected 64 hex chars, got %q", got)
	}
	if sha256HexContent(nil) != "" {
		t.Fatal("empty content should yield empty hash param path")
	}
}
