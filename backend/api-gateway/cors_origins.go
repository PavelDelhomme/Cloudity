package main

import (
	"net"
	"net/url"
	"os"
	"strings"
)

// Méthodes exposées au navigateur (PATCH requis pour Mail : lu/non-lu, alias, etc.).
var corsAllowedMethods = []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"}

// isDevBrowserOrigin autorise les origines de dev local (localhost, *.localhost, LAN privé).
// Utilisé quand CORS_ALLOW_LAN=true (défaut docker-compose dev).
func isDevBrowserOrigin(origin string) bool {
	o := strings.TrimSpace(origin)
	if o == "" {
		return false
	}
	u, err := url.Parse(o)
	if err != nil || u.Host == "" {
		return false
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme == "chrome-extension" {
		return true
	}
	if scheme != "http" && scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if host == "localhost" || host == "127.0.0.1" {
		return true
	}
	// ex. cloudity.localhost:6001 (résolution 127.0.0.1 via DNS modernes)
	if strings.HasSuffix(host, ".localhost") {
		return true
	}
	if ip := net.ParseIP(host); ip != nil && ip.IsPrivate() {
		return true
	}
	return false
}

func corsOriginAllowedFixedList(origin string) bool {
	o := strings.TrimSpace(origin)
	if o == "" {
		return false
	}
	origins := []string{"http://localhost:6001", "http://localhost:5173"}
	if v := os.Getenv("CORS_ORIGINS"); v != "" {
		origins = strings.Split(v, ",")
		for i, s := range origins {
			origins[i] = strings.TrimSpace(s)
		}
	}
	for _, allowed := range origins {
		if allowed != "" && strings.EqualFold(o, allowed) {
			return true
		}
	}
	return false
}
