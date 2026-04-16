package main

import (
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/rs/cors"
	"golang.org/x/time/rate"
)

type Service struct {
	Name   string
	URL    string
	Prefix string
}

var services = []Service{
	{Name: "auth", URL: "http://auth-service:8081", Prefix: "/auth"},
	{Name: "admin", URL: "http://admin-service:8082", Prefix: "/admin"},
	{Name: "pass", URL: "http://password-manager:8051", Prefix: "/pass"},
	{Name: "mail", URL: getEnv("MAIL_DIRECTORY_SERVICE_URL", "http://mail-directory-service:8050"), Prefix: "/mail"},
	{Name: "calendar", URL: "http://calendar-service:8052", Prefix: "/calendar"},
	{Name: "notes", URL: "http://notes-service:8053", Prefix: "/notes"},
	{Name: "tasks", URL: "http://tasks-service:8054", Prefix: "/tasks"},
	{Name: "photos", URL: getEnv("PHOTOS_SERVICE_URL", "http://photos-service:8057"), Prefix: "/photos"},
	{Name: "drive", URL: "http://drive-service:8055", Prefix: "/drive"},
	{Name: "contacts", URL: "http://contacts-service:8056", Prefix: "/contacts"},
}

var limiter = rate.NewLimiter(10, 20) // 10 requests per second, burst of 20

var (
	publicKeyMu  sync.RWMutex
	publicKeyVal interface{}
)

// invalidatePublicKey force le rechargement de la clé au prochain loadPublicKey (après redémarrage auth-service).
func invalidatePublicKey() {
	publicKeyMu.Lock()
	defer publicKeyMu.Unlock()
	publicKeyVal = nil
	log.Println("[gateway] JWT public key cache invalidé. Reconnectez-vous (déconnexion puis connexion) pour obtenir un nouveau token.")
}

// loadPublicKey charge la clé publique RSA du auth-service. Recharge depuis le disque si le cache a été invalidé (ex. après erreur de signature).
func loadPublicKey() interface{} {
	publicKeyMu.RLock()
	k := publicKeyVal
	publicKeyMu.RUnlock()
	if k != nil {
		return k
	}
	publicKeyMu.Lock()
	defer publicKeyMu.Unlock()
	// Double-check after lock
	if publicKeyVal != nil {
		return publicKeyVal
	}
	paths := []string{
		os.Getenv("JWT_PUBLIC_KEY_PATH"),
		"/app/keys/public.pem",
		"public.pem",
		"../auth-service/public.pem",
	}
	for _, path := range paths {
		if path == "" {
			continue
		}
		bytes, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		key, err := jwt.ParseRSAPublicKeyFromPEM(bytes)
		if err != nil {
			continue
		}
		publicKeyVal = key
		log.Printf("[gateway] JWT public key loaded from %s", path)
		return key
	}
	log.Println("[gateway] JWT public key not found. /pass and /mail will return 401. Run make setup then make up. Then log out and log in again.")
	return nil
}

// NewHandler construit le handler HTTP (utilisé par main et par les tests).
func NewHandler() http.Handler {
	r := mux.NewRouter()
	r.Use(rateLimitMiddleware)
	r.Use(authMiddleware)
	r.Use(loggingMiddleware)

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	}).Methods("GET")

	for _, svc := range services {
		serviceURL, _ := url.Parse(svc.URL)
		proxy := httputil.NewSingleHostReverseProxy(serviceURL)
		// Supprimer tous les en-têtes CORS de la réponse du backend pour éviter doublon avec le middleware CORS du gateway.
		proxy.ModifyResponse = func(resp *http.Response) error {
			for k := range resp.Header {
				if strings.HasPrefix(k, "Access-Control-") {
					resp.Header.Del(k)
				}
			}
			return nil
		}
		su, pr := serviceURL, proxy
		svcName := svc.Name
		r.PathPrefix(svc.Prefix).HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// auth-service expose GET /health, pas /auth/health : réécrire pour que le proxy fonctionne
			if svcName == "auth" && r.URL.Path == "/auth/health" {
				r.URL.Path = "/health"
			}
			r.URL.Host = su.Host
			r.URL.Scheme = su.Scheme
			r.Header.Set("X-Forwarded-Host", r.Host)
			pr.ServeHTTP(w, r)
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	origins := []string{"http://localhost:6001", "http://localhost:5173"}
	if o := os.Getenv("CORS_ORIGINS"); o != "" {
		origins = strings.Split(o, ",")
		for i, s := range origins {
			origins[i] = strings.TrimSpace(s)
		}
	}
	var corsHandler http.Handler
	if os.Getenv("CORS_ALLOW_LAN") == "true" || os.Getenv("CORS_ALLOW_LAN") == "1" {
		// Autorise localhost + réseau local (smartphone / autre machine sur le LAN).
		allowOriginFunc := func(origin string) bool {
			u, err := url.Parse(origin)
			if err != nil || u.Scheme != "http" {
				return false
			}
			host := u.Hostname()
			if host == "localhost" || host == "127.0.0.1" {
				return true
			}
			ip := net.ParseIP(host)
			if ip != nil && ip.IsPrivate() {
				return true
			}
			return false
		}
		corsHandler = cors.New(cors.Options{
			AllowOriginFunc:   allowOriginFunc,
			AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"*"},
			AllowCredentials: true,
		}).Handler(r)
	} else {
		c := cors.New(cors.Options{
			AllowedOrigins:   origins,
			AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"*"},
			AllowCredentials: true,
		})
		corsHandler = c.Handler(r)
	}
	return corsHandler
}

func main() {
	godotenv.Load()
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	log.Println("API Gateway starting on port ", port, "...")
	http.ListenAndServe(":"+port, NewHandler())
}

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow() {
			http.Error(w, "Too many requests", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for public endpoints
		if strings.HasPrefix(r.URL.Path, "/auth/login") ||
			strings.HasPrefix(r.URL.Path, "/auth/register") ||
			strings.HasPrefix(r.URL.Path, "/auth/refresh") ||
			strings.HasPrefix(r.URL.Path, "/auth/health") ||
			r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			next.ServeHTTP(w, r)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		tokenString = strings.TrimSpace(tokenString)
		if tokenString == "" {
			next.ServeHTTP(w, r)
			return
		}

		pubKey := loadPublicKey()
		if pubKey == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"auth key not ready"}`))
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return pubKey, nil
		})

		if err != nil || token == nil || !token.Valid {
			if err != nil {
				log.Printf("[gateway] JWT invalid for %s: %v", r.URL.Path, err)
				if strings.Contains(err.Error(), "signature") || strings.Contains(err.Error(), "verification error") {
					invalidatePublicKey()
				}
			}
			// Requête avec Bearer mais token invalide ou expiré → 401 pour que le client se reconnecte
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			w.Write([]byte(`{"error":"invalid or expired token"}`))
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}
		if userID, _ := claims["user_id"].(string); userID != "" {
			r.Header.Set("X-User-ID", userID)
		}
		if tenantID, _ := claims["tenant_id"].(string); tenantID != "" {
			r.Header.Set("X-Tenant-ID", tenantID)
		}
		// JSON numbers may unmarshal as float64
		if r.Header.Get("X-User-ID") == "" {
			if n, ok := claims["user_id"].(float64); ok && n >= 1 {
				r.Header.Set("X-User-ID", strconv.Itoa(int(n)))
			}
		}
		if r.Header.Get("X-Tenant-ID") == "" {
			if n, ok := claims["tenant_id"].(float64); ok && n >= 1 {
				r.Header.Set("X-Tenant-ID", strconv.Itoa(int(n)))
			}
		}

		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
