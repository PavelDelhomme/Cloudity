package main

import (
	"testing"
	"time"
)

func TestParseExifDateTime(t *testing.T) {
	t.Parallel()
	got, ok := parseExifDateTime("2024:05:21 14:30:15")
	if !ok {
		t.Fatal("expected parse ok")
	}
	if got.Format("2006-01-02T15:04:05") != "2024-05-21T14:30:15" {
		t.Fatalf("got %s", got.Format(time.RFC3339))
	}
}

func TestIsHeicLike(t *testing.T) {
	t.Parallel()
	if !isHeicLike("IMG_123.heic", "") {
		t.Fatal("expected heic by extension")
	}
	if isHeicLike("doc.pdf", "application/pdf") {
		t.Fatal("pdf must not be heic")
	}
}
