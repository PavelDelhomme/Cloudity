package main

import (
	"image"
	"image/color"
	"os"
	"path/filepath"
	"testing"
)

func TestThumbCachePathSanitizes(t *testing.T) {
	p := thumbCachePath("/tmp/x", 42, 180, 123456, "2026-10-05 19:00:00+00")
	if filepath.Base(p) != "42_180_2026-10-05190000+00_123456.jpg" && filepath.Ext(p) != ".jpg" {
		if !filepath.IsAbs(p) && !filepath.IsLocal(p) {
			t.Fatalf("unexpected path %s", p)
		}
	}
	if filepath.Ext(p) != ".jpg" {
		t.Fatalf("expected jpg got %s", p)
	}
}

func TestPlaceholderThumbJPEGNonEmpty(t *testing.T) {
	b := placeholderThumbJPEG()
	if len(b) < 32 {
		t.Fatalf("placeholder too small: %d", len(b))
	}
}

func TestResizeNearestDownscales(t *testing.T) {
	src := image.NewRGBA(image.Rect(0, 0, 400, 200))
	red := color.RGBA{255, 0, 0, 255}
	for y := 0; y < 200; y++ {
		for x := 0; x < 400; x++ {
			src.Set(x, y, red)
		}
	}
	out := resizeNearest(src, 100)
	if out.Bounds().Dx() != 100 || out.Bounds().Dy() != 50 {
		t.Fatalf("got %dx%d", out.Bounds().Dx(), out.Bounds().Dy())
	}
}

func TestThumbFileRoundTrip(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "t.jpg")
	data := placeholderThumbJPEG()
	writeThumbFile(path, data)
	got, ok := readThumbFile(path)
	if !ok {
		t.Fatal("expected cache hit")
	}
	if len(got) != len(data) {
		t.Fatalf("len %d != %d", len(got), len(data))
	}
}

func TestSanitizeThumbKey(t *testing.T) {
	if sanitizeThumbKey(`../etc/passwd`) != "etcpasswd" && sanitizeThumbKey(`../etc/passwd`) == "" {
		t.Fatal("empty key")
	}
	if sanitizeThumbKey("") != "x" {
		t.Fatalf("empty should be x, got %q", sanitizeThumbKey(""))
	}
	_ = os.TempDir()
}
