package main

import (
	"bytes"
	"database/sql"
	"image"
	"image/color"
	_ "image/gif"
	"image/jpeg"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
)

var thumbLocks sync.Map // cache key → *sync.Mutex

func thumbCacheDir(h *Handler) string {
	if h != nil && strings.TrimSpace(h.thumbDir) != "" {
		return h.thumbDir
	}
	return filepath.Join(os.TempDir(), "hubera-drive-thumbs")
}

func sanitizeThumbKey(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if len(out) > 80 {
		out = out[:80]
	}
	if out == "" {
		return "x"
	}
	return out
}

func thumbCachePath(dir string, nodeID, sizePx, fileSize int, updatedAt string) string {
	key := sanitizeThumbKey(updatedAt) + "_" + strconv.Itoa(fileSize)
	return filepath.Join(dir, strconv.Itoa(nodeID)+"_"+strconv.Itoa(sizePx)+"_"+key+".jpg")
}

func placeholderThumbJPEG() []byte {
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	gray := color.RGBA{R: 38, G: 38, B: 42, A: 255}
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			img.Set(x, y, gray)
		}
	}
	var buf bytes.Buffer
	_ = jpeg.Encode(&buf, img, &jpeg.Options{Quality: 40})
	return buf.Bytes()
}

func encodeThumbJPEG(img image.Image, size int) ([]byte, error) {
	thumb := resizeNearest(img, size)
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, thumb, &jpeg.Options{Quality: 72}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func withThumbLock(key string, fn func()) {
	v, _ := thumbLocks.LoadOrStore(key, &sync.Mutex{})
	mu := v.(*sync.Mutex)
	mu.Lock()
	defer mu.Unlock()
	fn()
}

func readThumbFile(path string) ([]byte, bool) {
	b, err := os.ReadFile(path)
	if err != nil || len(b) < 32 {
		return nil, false
	}
	return b, true
}

func writeThumbFile(path string, data []byte) {
	if path == "" || len(data) == 0 {
		return
	}
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return
	}
	_ = os.Rename(tmp, path)
}

func serveThumbJPEG(c *gin.Context, data []byte, cacheHit bool) {
	c.Header("Content-Type", "image/jpeg")
	c.Header("Cache-Control", "private, max-age=86400")
	if cacheHit {
		c.Header("X-Hubera-Thumb", "cache")
	} else {
		c.Header("X-Hubera-Thumb", "generated")
	}
	c.Header("Content-Disposition", `inline; filename="thumbnail.jpg"`)
	c.Data(http.StatusOK, "image/jpeg", data)
}

func (h *Handler) getNodeThumbnail(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	size := 360
	if s, err := strconv.Atoi(c.DefaultQuery("size", "360")); err == nil && s >= 64 && s <= 1024 {
		size = s
	}
	ctx := c.Request.Context()
	var name string
	var mime sql.NullString
	var vaultEncrypted bool
	var fileSize int
	var updatedAt string
	err = h.dbex(ctx).QueryRow(`
		SELECT name, mime_type, vault_encrypted, COALESCE(size, 0), COALESCE(updated_at::text, '')
		FROM drive_nodes
		WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false AND deleted_at IS NULL
	`, id).Scan(&name, &mime, &vaultEncrypted, &fileSize, &updatedAt)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if vaultEncrypted {
		c.Header("X-Cloudity-Vault-Encrypted", "1")
		c.JSON(http.StatusNotFound, gin.H{"error": "vault_encrypted", "code": "VAULT_ENCRYPTED"})
		return
	}
	ct := "application/octet-stream"
	if mime.Valid && strings.TrimSpace(mime.String) != "" {
		ct = strings.TrimSpace(mime.String)
	}
	if ct == "application/octet-stream" || ct == "" {
		if inf := mimeFromFileName(name); inf != "" {
			ct = inf
		}
	}
	c.Header("Cache-Control", "private, max-age=86400")
	if isNonPhotoThumbnail(name, ct) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_an_image"})
		return
	}

	dir := thumbCacheDir(h)
	cachePath := thumbCachePath(dir, id, size, fileSize, updatedAt)
	if hit, ok := readThumbFile(cachePath); ok {
		serveThumbJPEG(c, hit, true)
		return
	}

	var out []byte
	fromCache := false
	withThumbLock(cachePath, func() {
		if hit, ok := readThumbFile(cachePath); ok {
			out = hit
			fromCache = true
			return
		}
		var content []byte
		qerr := h.dbex(ctx).QueryRow(`
			SELECT COALESCE(content, ''::bytea) FROM drive_nodes
			WHERE id = $1 AND user_id = current_setting('app.current_user_id', true)::INTEGER AND is_folder = false AND deleted_at IS NULL
		`, id).Scan(&content)
		if qerr != nil || len(content) == 0 {
			out = placeholderThumbJPEG()
			return
		}
		img, derr := decodeThumbnailImage(name, ct, content)
		if derr != nil {
			// Jamais renvoyer l'original : une grille de HEIC/WebP devenait des fichiers de plusieurs Mo.
			out = placeholderThumbJPEG()
			writeThumbFile(cachePath, out)
			return
		}
		encoded, eerr := encodeThumbJPEG(img, size)
		if eerr != nil || len(encoded) == 0 {
			out = placeholderThumbJPEG()
			return
		}
		writeThumbFile(cachePath, encoded)
		out = encoded
	})
	if len(out) == 0 {
		out = placeholderThumbJPEG()
	}
	serveThumbJPEG(c, out, fromCache)
}

func resizeNearest(src image.Image, maxSide int) image.Image {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w <= 0 || h <= 0 || (w <= maxSide && h <= maxSide) {
		return src
	}
	newW, newH := maxSide, maxSide
	if w >= h {
		newH = max(1, h*maxSide/w)
	} else {
		newW = max(1, w*maxSide/h)
	}
	dst := image.NewRGBA(image.Rect(0, 0, newW, newH))
	for y := 0; y < newH; y++ {
		sy := b.Min.Y + y*h/newH
		for x := 0; x < newW; x++ {
			sx := b.Min.X + x*w/newW
			dst.Set(x, y, src.At(sx, sy))
		}
	}
	return dst
}
