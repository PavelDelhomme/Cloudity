package main

import (
	"testing"
)

func TestParseDateFromHeaderBlock(t *testing.T) {
	raw := []byte("Date: Mon, 18 May 2026 14:30:00 +0200\r\n")
	tm := parseDateFromHeaderBlock(raw)
	if tm.IsZero() {
		t.Fatal("expected parsed date")
	}
	if tm.Year() != 2026 {
		t.Fatalf("year %d", tm.Year())
	}
}
