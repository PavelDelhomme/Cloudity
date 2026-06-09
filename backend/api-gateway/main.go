package main

import (
	"context"
	"crypto/ed25519"
	"crypto/rsa"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/joho/godotenv"
	"github.com/pavel/cloudity/internalsec"
	"github.com/rs/cors"
	"golang.org/x/time/rate"
)

// maxCSPReportBytes plafonne la taille acceptée pour un rapport CSP
// (les navigateurs envoient quelques Ko ; 64 KiB couvre largement).
const maxCSPReportBytes = 64 * 1024

type Service struct {
	Name   string
	URL    string
	Prefix string
}

var services = []Service{
	{Name: "auth", URL: getEnv("AUTH_SERVICE_URL", "http://auth-service:8081"), Prefix: "/auth"},
	{Name: "admin", URL: getEnv("ADMIN_SERVICE_URL", "http://admin-service:8082"), Prefix: "/admin"},
	{Name: "pass", URL: getEnv("PASSWORDS_SERVICE_URL", "http://passwords-service:8051"), Prefix: "/pass"},
	{Name: "mail", URL: getEnv("MAIL_DIRECTORY_SERVICE_URL", "http://mail-directory-service:8050"), Prefix: "/mail"},
	{Name: "calendar", URL: getEnv("CALENDAR_SERVICE_URL", "http://calendar-service:8052"), Prefix: "/calendar"},
	{Name: "notes", URL: getEnv("NOTES_SERVICE_URL", "http://notes-service:8053"), Prefix: "/notes"},
	{Name: "tasks", URL: getEnv("TASKS_SERVICE_URL", "http://tasks-service:8054"), Prefix: "/tasks"},
	{Name: "photos", URL: getEnv("PHOTOS_SERVICE_URL", "http://photos-service:8057"), Prefix: "/photos"},
	{Name: "drive", URL: getEnv("DRIVE_SERVICE_URL", "http://drive-service:8055"), Prefix: "/drive"},
	{Name: "contacts", URL: getEnv("CONTACTS_SERVICE_URL", "http://contacts-service:8056"), Prefix: "/contacts"},
}

var limiter = rate.NewLimiter(10, 20) // 10 requests per second, burst of 20

// loginRegisterLimiter : plafond plus strict sur POST /auth/login et /auth/register
// (bruteforce credentials, énumération d’emails à grande vitesse). Indépendant du
// limiteur global pour qu’un flood ciblé ne vide pas tout le budget API.
var loginRegisterLimiter = rate.NewLimiter(3, 12) // ~3 req/s en moyenne, rafale 12

// kidEd25519 / kidRSA — coordonnés avec backend/auth-service/main.go.
// NE PAS RENOMMER sans mettre à jour les deux services en même temps.
const (
	kidEd25519 = "ed25519-1"
	kidRSA     = "rs256-1"
)

var (
	publicKeyMu sync.RWMutex
	// publicKeyVal — clé RSA-2048 historique. Conservée pour vérifier les
	// tokens RS256 émis avant la migration EdDSA (Phase B). Décommissionnée
	// après 30j d'expiration des refresh tokens existants (Phase C — cf.
	// docs/securite/CRYPTO-NORME.md § 5.2).
	publicKeyVal interface{}
	// publicEd25519Val — clé Ed25519 utilisée pour vérifier TOUS les nouveaux
	// access tokens (Phase B active depuis 2026-05-12).
	publicEd25519Val ed25519.PublicKey
)

// invalidatePublicKey force le rechargement des clés au prochain loadPublicKey
// (après redémarrage auth-service ou rotation de paire).
func invalidatePublicKey() {
	publicKeyMu.Lock()
	defer publicKeyMu.Unlock()
	publicKeyVal = nil
	publicEd25519Val = nil
	log.Println("[gateway] JWT public keys cache invalidé. Reconnectez-vous (déconnexion puis connexion) pour obtenir un nouveau token.")
}

// loadPublicKey charge les clés publiques (RSA + Ed25519) émises par
// auth-service. Recharge depuis le disque si le cache a été invalidé.
//
// Retourne la clé RSA pour rétrocompat (anciens tests), mais la sélection
// JWT-aware se fait via selectKeyForToken qui choisit RSA ou Ed25519 selon
// le `kid` du token.
func loadPublicKey() interface{} {
	publicKeyMu.RLock()
	k := publicKeyVal
	publicKeyMu.RUnlock()
	if k != nil {
		return k
	}
	publicKeyMu.Lock()
	defer publicKeyMu.Unlock()
	if publicKeyVal != nil {
		return publicKeyVal
	}
	loadKeysLocked()
	return publicKeyVal
}

// loadKeysLocked tente de charger RSA et Ed25519 depuis le volume Docker
// partagé `./backend/auth-service:/app/keys:ro`. Doit être appelé sous
// publicKeyMu.Lock().
func loadKeysLocked() {
	rsaPaths := []string{
		os.Getenv("JWT_PUBLIC_KEY_PATH"),
		"/app/keys/public.pem",
		"public.pem",
		"../auth-service/public.pem",
	}
	for _, path := range rsaPaths {
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
		log.Printf("[gateway] JWT RSA public key loaded from %s (rétrocompat tokens RS256)", path)
		break
	}

	edPaths := []string{
		os.Getenv("JWT_ED25519_PUBLIC_KEY_PATH"),
		"/app/keys/public_ed25519.pem",
		"public_ed25519.pem",
		"../auth-service/public_ed25519.pem",
	}
	for _, path := range edPaths {
		if path == "" {
			continue
		}
		bytes, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		any, err := jwt.ParseEdPublicKeyFromPEM(bytes)
		if err != nil {
			continue
		}
		if pk, ok := any.(ed25519.PublicKey); ok {
			publicEd25519Val = pk
			log.Printf("[gateway] JWT Ed25519 public key loaded from %s (clé courante)", path)
			break
		}
	}

	if publicKeyVal == nil && publicEd25519Val == nil {
		log.Println("[gateway] JWT public keys not found. Toute requête authentifiée renverra 401. Run make setup then make up.")
	}
}

// selectKeyForToken est la callback `keyfunc` à passer à `jwt.Parse` /
// `jwt.ParseWithClaims`. Elle choisit la clé publique de vérification selon
// le `kid` du header JWT :
//
//   - kid == "ed25519-1"        → publicEd25519Val (clé courante)
//   - kid == "rs256-1" ou absent → publicKeyVal (RSA, rétrocompat)
//
// Vérifie aussi que la `Method` du token correspond à la classe attendue
// (refus du downgrade RS256→none ou EdDSA→HS256). Voir CRYPTO-NORME.md § 5
// pour le plan global.
func selectKeyForToken(token *jwt.Token) (interface{}, error) {
	publicKeyMu.RLock()
	rsaKey := publicKeyVal
	edKey := publicEd25519Val
	publicKeyMu.RUnlock()

	if rsaKey == nil && edKey == nil {
		// Premier lookup : tente de charger les clés depuis le disque.
		loadPublicKey()
		publicKeyMu.RLock()
		rsaKey = publicKeyVal
		edKey = publicEd25519Val
		publicKeyMu.RUnlock()
	}

	kid, _ := token.Header["kid"].(string)
	switch kid {
	case kidEd25519:
		if _, ok := token.Method.(*jwt.SigningMethodEd25519); !ok {
			return nil, fmt.Errorf("unexpected signing method %v for kid=%s", token.Method.Alg(), kid)
		}
		if edKey == nil {
			return nil, errors.New("Ed25519 public key not loaded")
		}
		return edKey, nil
	case kidRSA, "":
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method %v for kid=%q", token.Method.Alg(), kid)
		}
		if rsaKey == nil {
			return nil, errors.New("RSA public key not loaded")
		}
		// RSA *rsa.PublicKey, pas interface{} : explicit cast pour satisfaire keyfunc.
		if rk, ok := rsaKey.(*rsa.PublicKey); ok {
			return rk, nil
		}
		return rsaKey, nil
	default:
		return nil, fmt.Errorf("unknown kid %q", kid)
	}
}

// NewHandler construit le handler HTTP (utilisé par main et par les tests).
func NewHandler() http.Handler {
	r := mux.NewRouter()
	r.NotFoundHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write([]byte(`{"error":"not found"}`))
	})
	r.MethodNotAllowedHandler = http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		_, _ = w.Write([]byte(`{"error":"method not allowed"}`))
	})
	r.Use(securityHeadersMiddleware)
	r.Use(rateLimitMiddleware)
	r.Use(authMiddleware)
	r.Use(loggingMiddleware)

	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	}).Methods("GET")

	// CSP violation report endpoint — voir docs/securite/REVERSE-PROXY.md § 6.
	// Le navigateur envoie le rapport en `application/csp-report` ou
	// `application/reports+json` selon le standard utilisé. On loggue tout
	// ce qui arrive en JSON minifié, on répond 204.
	r.HandleFunc("/csp-report", handleCSPReport).Methods("POST")

	// Transport interne partagé pour le reverse proxy.
	//
	// MTLS_MODE=off (par défaut) → http.Transport plain (compat HTTP legacy).
	// MTLS_MODE=permissive|strict → TLS 1.3 + cert client step-ca chargés depuis
	// MTLS_CERT_FILE / MTLS_KEY_FILE / MTLS_CA_FILE.
	//
	// Permet de basculer le lien gateway↔services en HTTPS sans toucher au
	// reverse-proxy : il suffit de mettre les variables AUTH_SERVICE_URL=
	// https://auth-service:8443, etc. côté docker-compose.https.yml.
	mtlsCfg := internalsec.ConfigFromEnv()
	internalRT, err := internalsec.InternalRoundTripper(mtlsCfg)
	if err != nil {
		log.Fatalf("[gateway] internalsec.InternalRoundTripper: %v", err)
	}
	if mtlsCfg.Mode != internalsec.ModeOff {
		log.Printf("[gateway] mTLS interne activé (mode=%s, ca=%s)", mtlsCfg.Mode, mtlsCfg.CAFile)
	}

	for _, svc := range services {
		serviceURL, _ := url.Parse(svc.URL)
		svcName := svc.Name
		proxy := httputil.NewSingleHostReverseProxy(serviceURL)
		proxy.Transport = internalRT
		// Client qui quitte la page pendant un POST long (ex. sync mail) : pas de ligne « proxy error: context canceled ».
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			if errors.Is(err, context.Canceled) {
				return
			}
			log.Printf("[gateway] %s proxy: %v", svcName, err)
			w.WriteHeader(http.StatusBadGateway)
		}
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
		corsHandler = cors.New(cors.Options{
			AllowOriginFunc:  isDevBrowserOrigin,
			AllowedMethods:   corsAllowedMethods,
			AllowedHeaders:   []string{"*"},
			AllowCredentials: true,
		}).Handler(r)
	} else {
		c := cors.New(cors.Options{
			AllowedOrigins:   origins,
			AllowedMethods:   corsAllowedMethods,
			AllowedHeaders:   []string{"*"},
			AllowCredentials: true,
		})
		corsHandler = c.Handler(r)
	}
	return corsHandler
}

// securityHeadersMiddleware ajoute des en-têtes de durcissement navigateur sur toutes
// les réponses API (complète le reverse proxy en prod — voir REVERSE-PROXY.md).
//
// `Cache-Control: no-store` est forcé sur les chemins sensibles
// (`/auth/*`, `/pass/*`) : tokens, hashes, contenu déchiffré ne doivent jamais
// être mémorisés par un cache intermédiaire ou le bfcache navigateur.
func securityHeadersMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()")
		if isSensitivePath(r.URL.Path) {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Pragma", "no-cache")
		}
		next.ServeHTTP(w, r)
	})
}

// isSensitivePath identifie les chemins dont les réponses ne doivent jamais
// être mises en cache (tokens, secrets, données déchiffrées côté client).
func isSensitivePath(path string) bool {
	return strings.HasPrefix(path, "/auth/") ||
		strings.HasPrefix(path, "/pass/") ||
		strings.HasPrefix(path, "/admin/")
}

func main() {
	godotenv.Load()
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	log.Println("API Gateway starting on port ", port, "...")
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           NewHandler(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}

// isDriveMediaRead : miniatures / contenu Drive (grilles Photos) — pas de plafond global
// (sinon 429 dès ~20 vignettes affichées en parallèle).
func isDriveMediaRead(path, method string) bool {
	if method != http.MethodGet {
		return false
	}
	if !strings.HasPrefix(path, "/drive/nodes/") {
		return false
	}
	return strings.HasSuffix(path, "/thumbnail") || strings.HasSuffix(path, "/content")
}

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isDriveMediaRead(r.URL.Path, r.Method) && !limiter.Allow() {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"error":"too many requests"}`))
			return
		}
		if r.Method == http.MethodPost && (r.URL.Path == "/auth/login" || r.URL.Path == "/auth/register" ||
			strings.HasPrefix(r.URL.Path, "/auth/e2e/")) {
			if !loginRegisterLimiter.Allow() {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				_, _ = w.Write([]byte(`{"error":"too many requests"}`))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

// adminAPIRequiresSession indique si la gateway doit exiger un JWT valide avec rôle admin
// (le service admin-service ne vérifie pas le JWT : la sécurité repose sur la gateway + réseau interne).
func adminAPIRequiresSession(path string, method string) bool {
	if method == http.MethodOptions {
		return false
	}
	return strings.HasPrefix(path, "/admin")
}

func adminOriginAllowed(origin string) bool {
	o := strings.TrimSpace(origin)
	if o == "" {
		return false
	}
	u, err := url.Parse(o)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return false
	}

	if os.Getenv("CORS_ALLOW_LAN") == "true" || os.Getenv("CORS_ALLOW_LAN") == "1" {
		return isDevBrowserOrigin(o)
	}
	return corsOriginAllowedFixedList(o)
}

func writeJSON(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

func requireAdminAPIOrigin(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodOptions {
		return true
	}
	origin := r.Header.Get("Origin")
	if !adminOriginAllowed(origin) {
		writeJSON(w, http.StatusForbidden, `{"error":"admin API: origin not allowed"}`)
		return false
	}
	return true
}

func requirePerformanceIngestToken(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != http.MethodPost || r.URL.Path != "/admin/performance/pipeline-run" {
		return true
	}
	expected := strings.TrimSpace(os.Getenv("PERFORMANCE_INGEST_TOKEN"))
	if expected == "" {
		writeJSON(w, http.StatusServiceUnavailable, `{"error":"PERFORMANCE_INGEST_TOKEN is not configured on gateway"}`)
		return false
	}
	got := strings.TrimSpace(r.Header.Get("X-Cloudity-Perf-Ingest"))
	if len(got) == 0 || subtle.ConstantTimeCompare([]byte(got), []byte(expected)) != 1 {
		writeJSON(w, http.StatusUnauthorized, `{"error":"invalid performance ingest token"}`)
		return false
	}
	return true
}

// stripInternalTrustHeaders enlève systématiquement les headers que la gateway
// ré-injecte après vérification (X-User-ID, X-Tenant-ID, X-Admin-Role). Évite
// qu'un client ne pré-positionne ces valeurs et trompe les services downstream
// qui revérifient (defense in depth — cf. docs/securite/AUDIT-SECURITE.md).
func stripInternalTrustHeaders(r *http.Request) {
	r.Header.Del("X-User-ID")
	r.Header.Del("X-Tenant-ID")
	r.Header.Del("X-Admin-Role")
}

func authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Toujours nettoyer les headers de confiance avant l'évaluation.
		stripInternalTrustHeaders(r)

		// Préflight CORS : ne pas exiger de Bearer (le navigateur n'envoie souvent pas Authorization sur OPTIONS).
		if r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}

		// Skip auth for public endpoints
		if strings.HasPrefix(r.URL.Path, "/auth/login") ||
			strings.HasPrefix(r.URL.Path, "/auth/register") ||
			strings.HasPrefix(r.URL.Path, "/auth/e2e/") ||
			strings.HasPrefix(r.URL.Path, "/auth/refresh") ||
			strings.HasPrefix(r.URL.Path, "/auth/webauthn/login") ||
			strings.HasPrefix(r.URL.Path, "/auth/health") ||
			r.URL.Path == "/health" ||
			r.URL.Path == "/csp-report" {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")

		// API admin : JWT obligatoire + rôle admin (+ Origin navigateur autorisée).
		if adminAPIRequiresSession(r.URL.Path, r.Method) {
			if !requireAdminAPIOrigin(w, r) {
				return
			}
			if authHeader == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":"authentication required for admin API"}`))
				return
			}
			tokenString := strings.TrimPrefix(authHeader, "Bearer ")
			tokenString = strings.TrimSpace(tokenString)
			if tokenString == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":"authentication required for admin API"}`))
				return
			}
			// Pré-chargement des clés (RSA + Ed25519) avant l'appel à
			// jwt.Parse. selectKeyForToken les utilisera selon le `kid`.
			loadPublicKey()
			token, err := jwt.Parse(tokenString, selectKeyForToken)
			if err != nil || token == nil || !token.Valid {
				if err != nil {
					log.Printf("[gateway] JWT invalid for %s: %v", r.URL.Path, err)
					if strings.Contains(err.Error(), "signature") || strings.Contains(err.Error(), "verification error") {
						invalidatePublicKey()
					}
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"error":"invalid or expired token"}`))
				return
			}
			claims, ok := token.Claims.(jwt.MapClaims)
			if !ok || !tokenHasAdminRole(claims) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				w.Write([]byte(`{"error":"admin role required"}`))
				return
			}
			if !requirePerformanceIngestToken(w, r) {
				return
			}
			if userID, _ := claims["user_id"].(string); userID != "" {
				r.Header.Set("X-User-ID", userID)
			}
			if tenantID, _ := claims["tenant_id"].(string); tenantID != "" {
				r.Header.Set("X-Tenant-ID", tenantID)
			}
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
			return
		}

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

		loadPublicKey()
		token, err := jwt.Parse(tokenString, selectKeyForToken)

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
		adminOnly := isAdminOnlyMailRoute(r.URL.Path) || isAdminOnlyPassRoute(r.URL.Path)
		if adminOnly && !tokenHasAdminRole(claims) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			w.Write([]byte(`{"error":"admin role required"}`))
			return
		}
		if adminOnly {
			// Défense en profondeur : le service downstream peut revérifier ce header.
			r.Header.Set("X-Admin-Role", "admin")
		}

		next.ServeHTTP(w, r)
	})
}

func isAdminOnlyMailRoute(path string) bool {
	return strings.HasPrefix(path, "/mail/domains") ||
		strings.HasPrefix(path, "/mail/mailboxes") ||
		strings.HasPrefix(path, "/mail/aliases")
}

// isAdminOnlyPassRoute regroupe les routes Pass réservées aux admins (stats
// internes, migrations format-version). Le rôle admin est exigé côté gateway,
// puis revérifié par le passwords-service via X-Admin-Role.
func isAdminOnlyPassRoute(path string) bool {
	return strings.HasPrefix(path, "/pass/admin")
}

func tokenHasAdminRole(claims jwt.MapClaims) bool {
	if role, ok := claims["role"].(string); ok && strings.EqualFold(strings.TrimSpace(role), "admin") {
		return true
	}
	if roles, ok := claims["roles"].([]interface{}); ok {
		for _, raw := range roles {
			if s, ok := raw.(string); ok && strings.EqualFold(strings.TrimSpace(s), "admin") {
				return true
			}
		}
	}
	return false
}

// logResponseWriter capture le code HTTP final pour les journaux de latence (TR-06 / PERFORMANCES.md).
type logResponseWriter struct {
	http.ResponseWriter
	status int
}

func (lw *logResponseWriter) WriteHeader(code int) {
	if lw.status == 0 {
		lw.status = code
	}
	lw.ResponseWriter.WriteHeader(code)
}

func (lw *logResponseWriter) Write(b []byte) (int, error) {
	if lw.status == 0 {
		lw.status = http.StatusOK
	}
	return lw.ResponseWriter.Write(b)
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		lw := &logResponseWriter{ResponseWriter: w, status: 0}
		next.ServeHTTP(lw, r)
		status := lw.status
		if status == 0 {
			status = http.StatusOK
		}
		log.Printf("[gateway] %s %s -> %d %s", r.Method, r.URL.Path, status, time.Since(start).Round(time.Millisecond))
	})
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// handleCSPReport reçoit un rapport de violation CSP émis par le navigateur
// (Content-Security-Policy-Report-Only ou Reporting API). On loggue le payload
// JSON minifié et on répond 204 — pas d'authentification ni de stockage en DB
// pour rester aussi minimal qu'utile en pré-prod (cf. docs/securite/REVERSE-PROXY.md § 6).
func handleCSPReport(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, maxCSPReportBytes+1))
	defer r.Body.Close()
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if len(body) > maxCSPReportBytes {
		log.Printf("[gateway] csp-report: payload too large (%d bytes)", len(body))
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		return
	}
	body = []byte(strings.TrimSpace(string(body)))
	if len(body) == 0 {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// Minifier en re-sérialisant si possible (sinon on logge brut, tronqué).
	var parsed interface{}
	if err := json.Unmarshal(body, &parsed); err == nil {
		if b, err := json.Marshal(parsed); err == nil {
			log.Printf("[gateway] csp-report ua=%q %s", r.UserAgent(), string(b))
			w.WriteHeader(http.StatusNoContent)
			return
		}
	}
	if len(body) > 2048 {
		body = body[:2048]
	}
	log.Printf("[gateway] csp-report (raw) ua=%q %s", r.UserAgent(), string(body))
	w.WriteHeader(http.StatusNoContent)
}
