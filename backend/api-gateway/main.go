package main

import (
	"log"
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
}

var limiter = rate.NewLimiter(10, 20) // 10 requests per second, burst of 20

var (
	publicKeyOnce sync.Once
	publicKeyVal  interface{}
)

// loadPublicKey charge la clé publique RSA du auth-service pour valider les JWT (une seule fois).
// Fichier : JWT_PUBLIC_KEY_PATH, sinon /app/keys/public.pem (Docker), sinon ./public.pem (dev local).
func loadPublicKey() interface{} {
	publicKeyOnce.Do(func() {
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
			return
		}
		log.Println("[gateway] JWT public key not found. /pass and /mail will return 401 until auth-service public.pem is available. Run ./scripts/setup.sh then make up.")
	})
	return publicKeyVal
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
	c := cors.New(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: true,
	})
	return c.Handler(r)
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
			next.ServeHTTP(w, r)
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return pubKey, nil
		})

		if err != nil || token == nil || !token.Valid {
			if err != nil {
				log.Printf("[gateway] JWT invalid for %s: %v", r.URL.Path, err)
			}
			next.ServeHTTP(w, r)
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
