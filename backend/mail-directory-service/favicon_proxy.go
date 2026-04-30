package main

import (
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type faviconCacheEntry struct {
	body        []byte
	contentType string
	expiresAt   time.Time
}

var (
	faviconCacheMu sync.RWMutex
	faviconCache   = map[string]faviconCacheEntry{}
	domainRx       = regexp.MustCompile(`^[a-z0-9.-]{1,253}$`)
)

const faviconCacheTTL = 24 * time.Hour

func normalizeFaviconDomain(raw string) string {
	d := strings.TrimSpace(strings.ToLower(raw))
	d = strings.TrimPrefix(d, "http://")
	d = strings.TrimPrefix(d, "https://")
	if i := strings.IndexByte(d, '/'); i >= 0 {
		d = d[:i]
	}
	d = strings.Trim(d, ".")
	if d == "" || strings.Contains(d, "..") || !strings.Contains(d, ".") || !domainRx.MatchString(d) {
		return ""
	}
	return d
}

func getFaviconFromCache(domain string) (faviconCacheEntry, bool) {
	now := time.Now()
	faviconCacheMu.RLock()
	entry, ok := faviconCache[domain]
	faviconCacheMu.RUnlock()
	if !ok || now.After(entry.expiresAt) {
		return faviconCacheEntry{}, false
	}
	return entry, true
}

func setFaviconCache(domain string, body []byte, contentType string) {
	faviconCacheMu.Lock()
	defer faviconCacheMu.Unlock()
	faviconCache[domain] = faviconCacheEntry{
		body:        body,
		contentType: contentType,
		expiresAt:   time.Now().Add(faviconCacheTTL),
	}
}

func (h *Handler) mailFaviconProxy(c *gin.Context) {
	domain := normalizeFaviconDomain(c.Query("domain"))
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid domain"})
		return
	}
	if cached, ok := getFaviconFromCache(domain); ok {
		c.Header("Cache-Control", "public, max-age=86400")
		c.Data(http.StatusOK, cached.contentType, cached.body)
		return
	}

	client := &http.Client{Timeout: 4 * time.Second}
	upstreamURL := "https://icons.duckduckgo.com/ip3/" + domain + ".ico"
	req, err := http.NewRequest(http.MethodGet, upstreamURL, nil)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "favicon request failed"})
		return
	}
	req.Header.Set("User-Agent", "Cloudity-Mail-Favicon-Proxy/1.0")
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "favicon upstream unreachable"})
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		c.JSON(http.StatusNotFound, gin.H{"error": "favicon not found"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil || len(body) == 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": "favicon read failed"})
		return
	}
	contentType := strings.TrimSpace(resp.Header.Get("Content-Type"))
	if contentType == "" {
		contentType = "image/x-icon"
	}
	setFaviconCache(domain, body, contentType)
	c.Header("Cache-Control", "public, max-age=86400")
	c.Data(http.StatusOK, contentType, body)
}
