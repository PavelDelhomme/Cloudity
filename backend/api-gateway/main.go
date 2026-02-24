package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

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
}

var limiter = rate.NewLimiter(10, 20) // 10 requests per second, burst of 20

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
		r.PathPrefix(svc.Prefix).HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
			strings.HasPrefix(r.URL.Path, "/health") {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			next.ServeHTTP(w, r)
			return
		}

		tokenString := strings.Replace(authHeader, "Bearer ", "", 1)

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			// Validate with auth service public key
			return loadPublicKey(), nil
		})

		if err == nil && token.Valid {
			if claims, ok := token.Claims.(jwt.MapClaims); ok {
				r.Header.Set("X-User-ID", claims["user_id"].(string))
				r.Header.Set("X-Tenant-ID", claims["tenant_id"].(string))
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

// loadPublicKey charge la clé publique RSA du auth-service pour valider les JWT (optionnel en test).
func loadPublicKey() interface{} {
	// TODO: charger backend/auth-service/public.pem
	return nil
}
