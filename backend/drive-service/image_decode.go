package main

import (
	"bytes"
	"image"
	"io"
	"strings"
	"time"

	"github.com/jdeng/goheif"
	"github.com/rwcarlsen/goexif/exif"
)

func isHeicLike(name, contentType string) bool {
	lower := strings.ToLower(name)
	if strings.HasSuffix(lower, ".heic") || strings.HasSuffix(lower, ".heif") {
		return true
	}
	base := strings.ToLower(strings.TrimSpace(contentType))
	if i := strings.Index(base, ";"); i > 0 {
		base = strings.TrimSpace(base[:i])
	}
	return base == "image/heic" || base == "image/heif"
}

func decodeThumbnailImage(name, contentType string, content []byte) (image.Image, error) {
	if isHeicLike(name, contentType) {
		if img, err := goheif.Decode(bytes.NewReader(content)); err == nil {
			return img, nil
		}
	}
	img, _, err := image.Decode(bytes.NewReader(content))
	return img, err
}

// photoTakenAtFromExif tente d'extraire DateTimeOriginal depuis EXIF (HEIC/JPEG).
func photoTakenAtFromExif(name, contentType string, content []byte) (time.Time, bool) {
	if len(content) == 0 {
		return time.Time{}, false
	}
	readers := []io.Reader{bytes.NewReader(content)}
	if isHeicLike(name, contentType) {
		if raw, err := goheif.ExtractExif(bytes.NewReader(content)); err == nil && len(raw) > 0 {
			readers = append([]io.Reader{bytes.NewReader(raw)}, readers...)
		}
	}
	for _, r := range readers {
		x, err := exif.Decode(r)
		if err != nil {
			continue
		}
		if tm, err := x.DateTime(); err == nil {
			return tm.UTC(), true
		}
		if tag, err := x.Get(exif.DateTimeOriginal); err == nil {
			if s, err := tag.StringVal(); err == nil {
				if t, ok := parseExifDateTime(s); ok {
					return t.UTC(), true
				}
			}
		}
	}
	return time.Time{}, false
}

func parseExifDateTime(s string) (time.Time, bool) {
	s = strings.TrimSpace(s)
	s = strings.TrimSuffix(s, "\x00")
	for _, layout := range []string{
		"2006:01:02 15:04:05",
		"2006-01-02 15:04:05",
		time.RFC3339,
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
