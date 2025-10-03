package main

import (
	"encoding/json"
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

type ServiceInfo struct {
	Name   string `json:"name"`
	URL    string `json:"url"`
	Status string `json:"status"`
	Type   string `json:"type"`
}

type HealthResponse struct {
	Status    string                 `json:"status"`
	Service   string                 `json:"service"`
	Timestamp string                 `json:"timestamp"`
	Services  map[string]ServiceInfo `json:"services"`
}

func checkServiceHealth(url string) string {
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url + "/health")
	if err != nil {
		return "unreachable"
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		return "healthy"
	}
	return "unhealthy"
}

func getAllServices() map[string]ServiceInfo {
	services := map[string]ServiceInfo{
		// Infrastructure
		"postgres": {
			Name:   "PostgreSQL Database",
			URL:    "postgres://localhost:5432",
			Status: "unknown", // PostgreSQL n'a pas d'endpoint HTTP
			Type:   "infrastructure",
		},
		"redis": {
			Name:   "Redis Cache",
			URL:    "redis://localhost:6379",
			Status: "unknown", // Redis n'a pas d'endpoint HTTP
			Type:   "infrastructure",
		},

		// Backend Core
		"auth-service": {
			Name:   "Authentication Service",
			URL:    "http://localhost:8081",
			Status: checkServiceHealth("http://auth-service:8081"),
			Type:   "backend-core",
		},
		"api-gateway": {
			Name:   "API Gateway",
			URL:    "http://localhost:8000",
			Status: "healthy", // Self
			Type:   "backend-core",
		},
		"admin-service": {
			Name:   "Administration Service",
			URL:    "http://localhost:8082",
			Status: checkServiceHealth("http://admin-service:8082"),
			Type:   "backend-core",
		},

		// Backend Email
		"email-service": {
			Name:   "Email Service",
			URL:    "http://localhost:8091",
			Status: checkServiceHealth("http://email-service:8091"),
			Type:   "backend-email",
		},
		"alias-service": {
			Name:   "Email Alias Service",
			URL:    "http://localhost:8092",
			Status: checkServiceHealth("http://alias-service:8092"),
			Type:   "backend-email",
		},

		// Backend Password
		"password-service": {
			Name:   "Password Service",
			URL:    "http://localhost:8093",
			Status: checkServiceHealth("http://password-service:8093"),
			Type:   "backend-password",
		},

		// Frontend Applications
		"admin-dashboard": {
			Name:   "Admin Dashboard",
			URL:    "http://localhost:3000",
			Status: "unknown", // Frontend n'a pas forcément d'endpoint health
			Type:   "frontend",
		},
		"email-app": {
			Name:   "Email Application",
			URL:    "http://localhost:8094",
			Status: "unknown",
			Type:   "frontend",
		},
		"password-app": {
			Name:   "Password Application",
			URL:    "http://localhost:8095",
			Status: "unknown",
			Type:   "frontend",
		},
	}

	return services
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	// Configuration des URLs des services
	authServiceURL := os.Getenv("AUTH_SERVICE_URL")
	if authServiceURL == "" {
		authServiceURL = "http://auth-service:8081"
	}

	adminServiceURL := os.Getenv("ADMIN_SERVICE_URL")
	if adminServiceURL == "" {
		adminServiceURL = "http://admin-service:8082"
	}

	emailServiceURL := os.Getenv("EMAIL_SERVICE_URL")
	if emailServiceURL == "" {
		emailServiceURL = "http://email-service:8091"
	}

	aliasServiceURL := os.Getenv("ALIAS_SERVICE_URL")
	if aliasServiceURL == "" {
		aliasServiceURL = "http://alias-service:8092"
	}

	r := mux.NewRouter()

	// Health check avec tous les services
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		services := getAllServices()

		response := HealthResponse{
			Status:    "healthy",
			Service:   "api-gateway",
			Timestamp: time.Now().UTC().Format(time.RFC3339),
			Services:  services,
		}

		jsonResponse, err := json.MarshalIndent(response, "", "  ")
		if err != nil {
			http.Error(w, "Error generating response", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		w.Write(jsonResponse)
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

	// Proxy vers email-service
	emailURL, _ := url.Parse(emailServiceURL)
	emailProxy := httputil.NewSingleHostReverseProxy(emailURL)
	r.PathPrefix("/api/v1/emails").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.URL.Host = emailURL.Host
		r.URL.Scheme = emailURL.Scheme
		r.Header.Set("X-Forwarded-Host", r.Host)
		emailProxy.ServeHTTP(w, r)
	})

	// Proxy vers alias-service
	aliasURL, _ := url.Parse(aliasServiceURL)
	aliasProxy := httputil.NewSingleHostReverseProxy(aliasURL)
	r.PathPrefix("/api/v1/aliases").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.URL.Host = aliasURL.Host
		r.URL.Scheme = aliasURL.Scheme
		r.Header.Set("X-Forwarded-Host", r.Host)
		aliasProxy.ServeHTTP(w, r)
	})

	// CORS CORRIGÉ - une seule origin ou wildcard
	c := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"}, // CORRIGÉ: wildcard seul
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		AllowCredentials: false, // CORRIGÉ: false avec wildcard
	})

	handler := c.Handler(r)

	log.Printf("🌐 API Gateway starting on port %s", port)
	log.Printf("🔐 Proxying /api/v1/auth/* to %s", authServiceURL)
	log.Printf("🏢 Proxying /api/v1/admin/* to %s", adminServiceURL)
	log.Printf("📧 Proxying /api/v1/emails* to %s", emailServiceURL)
	log.Printf("🔗 Proxying /api/v1/aliases* to %s", aliasServiceURL)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}
