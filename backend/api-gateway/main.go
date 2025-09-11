package main

import (
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/joho/godotenv/autoload"
	"github.com/rs/cors"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		authServiceURL = "http://auth-service:8081"
	}

	adminServiceURL := os.Getenv("ADMIN_SERVICE_URL")
	if adminServiceURL == "" {
		adminServiceURL = "http://admin-service:8082"
	}

	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{
			"status": "healthy",
			"service": "api-gateway",
			"timestamp": "` + time.Now().UTC().Format(time.RFC3339) + `",
			"services": {
				"auth_service": "` + authServiceURL + `",
				"admin_service": "` + adminServiceURL + `"
			}
		}`))
	}).Methods("GET")

	// Proxy vers auth-service
	authURL, _ := url.Parse(authServiceURL)
	authProxy := httputil.NewSingleHostReverseProxy(authURL)
	r.PathPrefix("/api/v1/auth/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.URL.Host = authURL.Host
		r.URL.Scheme = authURL.Scheme
		r.Header.Set("X-Forwarded-Host", r.Host)
		authProxy.ServeHTTP(w, r)
	})

	// Proxy vers admin-service
	adminURL, _ := url.Parse(adminServiceURL)
	adminProxy := httputil.NewSingleHostReverseProxy(adminURL)
	r.PathPrefix("/api/v1/admin/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.URL.Host = adminURL.Host
		r.URL.Scheme = adminURL.Scheme
		r.Header.Set("X-Forwarded-Host", r.Host)
		adminProxy.ServeHTTP(w, r)
	})

	// CORS CORRIGÉ - une seule origin ou wildcard
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"}, // CORRIGÉ: wildcard seul
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false, // CORRIGÉ: false avec wildcard
	})

	handler := c.Handler(r)

	log.Printf("API Gateway starting on port %s", port)
	log.Printf("Proxying /api/v1/auth/* to %s", authServiceURL)
	log.Printf("Proxying /api/v1/admin/* to %s", adminServiceURL)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
