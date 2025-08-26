package main

import (
    "context"
    "log"
    "net/http"
    "net/http/httputil"
    "net/url"
    "os"
    "strings"
    "time"

    "github.com/gorilla/mux"
    "github.com/golang-jwt/jwt/v5"
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

func main() {
    godotenv.Load()
    
    r := mux.NewRouter()

    // Middleware
    r.Use(rateLimitMiddleware)
    r.Use(authMiddleware)
    r.Use(loggingMiddleware)

    // Health check
    r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte(`{"status":"healthy"}`))
    }).Methods("GET")

    // Service routing
    for _, service := range services {
        serviceURL, _ := url.Parse(service.URL)
        proxy := httputil.NewSingleHostReverseProxy(serviceURL)
        
        r.PathPrefix(service.Prefix).HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            r.URL.Host = serviceURL.Host
            r.URL.Scheme = serviceURL.Scheme
            r.Header.Set("X-Forwarded-Host", r.Host)
            proxy.ServeHTTP(w, r)
        })
    }

    // CORS
    c := cors.New(cors.Options{
        AllowedOrigins: []string{"http://localhost:3000", "http://localhost:5173"},
        AllowedMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
        AllowedHeaders: []string{"*"},
        AllowCredentials: true,
    })

    handler := c.Handler(r)
    
    log.Println("API Gateway starting on port 8080...")
    http.ListenAndServe(":8080", handler)
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