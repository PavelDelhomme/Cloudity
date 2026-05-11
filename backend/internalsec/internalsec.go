// Package internalsec fournit les briques mTLS partagées par les microservices
// Cloudity (gateway, auth, passwords-service, mail-directory, drive, photos…).
//
// Voir docs/MTLS-INTERNE.md pour le plan global et la bascule progressive
// off → permissive → strict, et docs/SECURITE.md § 8 pour la cible
// post-quantique (certs hybrides ML-DSA + ECDSA).
//
// Sans dépendances tierces : ce package n'utilise que la stdlib pour rester
// importable depuis n'importe quel service Go du repo via `replace`.
package internalsec

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

// Mode pilote la stratégie mTLS d'un service au boot.
//
//   - ModeOff        : pas de TLS (état legacy ; HTTP plain).
//   - ModePermissive : TLS exigé, cert client vérifié uniquement s'il est fourni.
//   - ModeStrict     : TLS + cert client obligatoire et vérifié contre la CA interne.
type Mode string

const (
	ModeOff        Mode = "off"
	ModePermissive Mode = "permissive"
	ModeStrict     Mode = "strict"
)

// ParseMode lit la valeur (env MTLS_MODE par convention). Inconnu ⇒ ModeOff.
func ParseMode(v string) Mode {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case "strict":
		return ModeStrict
	case "permissive":
		return ModePermissive
	case "", "off", "disabled":
		return ModeOff
	default:
		return ModeOff
	}
}

// ServerConfig regroupe les chemins et le mode utilisés par ServerTLS.
type ServerConfig struct {
	Mode     Mode
	CertFile string // ex. /run/step/<svc>/cert.pem (tmpfs)
	KeyFile  string // ex. /run/step/<svc>/key.pem
	CAFile   string // bundle CA interne (root + intermediate)
}

// ConfigFromEnv lit la conf standard (variables documentées dans MTLS-INTERNE.md § 6).
func ConfigFromEnv() ServerConfig {
	return ServerConfig{
		Mode:     ParseMode(os.Getenv("MTLS_MODE")),
		CertFile: getenv("MTLS_CERT_FILE", "/run/step/cert.pem"),
		KeyFile:  getenv("MTLS_KEY_FILE", "/run/step/key.pem"),
		CAFile:   getenv("MTLS_CA_FILE", "/run/step/ca.pem"),
	}
}

// ServerTLS construit un *tls.Config prêt pour http.Server / gin selon le mode.
//
// En ModeOff, retourne (nil, nil) : l'appelant doit alors continuer en HTTP plain.
//
// Le certificat est rechargé via un GetCertificate atomique : un sidecar
// `step ca renew` peut écrire de nouveaux fichiers sur disque sans redémarrer
// le service. Appeler ReloadServer (renvoyé en option) déclenche le rechargement.
func ServerTLS(cfg ServerConfig) (*tls.Config, ReloadFunc, error) {
	if cfg.Mode == ModeOff {
		return nil, nil, nil
	}
	pool, err := loadCAPool(cfg.CAFile)
	if err != nil {
		return nil, nil, err
	}

	var current atomic.Pointer[tls.Certificate]
	reload := func() error {
		c, err := tls.LoadX509KeyPair(cfg.CertFile, cfg.KeyFile)
		if err != nil {
			return fmt.Errorf("load keypair: %w", err)
		}
		current.Store(&c)
		return nil
	}
	if err := reload(); err != nil {
		return nil, nil, err
	}

	tlsCfg := &tls.Config{
		MinVersion: tls.VersionTLS13,
		ClientCAs:  pool,
		GetCertificate: func(*tls.ClientHelloInfo) (*tls.Certificate, error) {
			c := current.Load()
			if c == nil {
				return nil, errors.New("no server certificate loaded")
			}
			return c, nil
		},
	}
	switch cfg.Mode {
	case ModePermissive:
		tlsCfg.ClientAuth = tls.VerifyClientCertIfGiven
	case ModeStrict:
		tlsCfg.ClientAuth = tls.RequireAndVerifyClientCert
	}
	return tlsCfg, reload, nil
}

// ReloadFunc est renvoyée par ServerTLS pour permettre un hot-reload du cert.
type ReloadFunc func() error

// ClientTLS construit un *tls.Config pour appeler un autre service en mTLS.
// CertFile/KeyFile peuvent être vides ⇒ TLS sans cert client (ModePermissive
// côté serveur). CAFile reste obligatoire pour vérifier le serveur.
func ClientTLS(cfg ServerConfig) (*tls.Config, error) {
	pool, err := loadCAPool(cfg.CAFile)
	if err != nil {
		return nil, err
	}
	out := &tls.Config{
		MinVersion: tls.VersionTLS13,
		RootCAs:    pool,
	}
	if cfg.CertFile != "" && cfg.KeyFile != "" {
		cert, err := tls.LoadX509KeyPair(cfg.CertFile, cfg.KeyFile)
		if err != nil {
			return nil, fmt.Errorf("client load keypair: %w", err)
		}
		out.Certificates = []tls.Certificate{cert}
	}
	return out, nil
}

// InternalHTTPClient produit un *http.Client mTLS prêt à appeler les services
// internes. Timeout 5s par défaut (les services internes doivent répondre vite).
func InternalHTTPClient(cfg ServerConfig) (*http.Client, error) {
	tlsCfg, err := ClientTLS(cfg)
	if err != nil {
		return nil, err
	}
	return &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			TLSClientConfig:       tlsCfg,
			ForceAttemptHTTP2:     true,
			IdleConnTimeout:       90 * time.Second,
			ResponseHeaderTimeout: 5 * time.Second,
		},
	}, nil
}

// PeerSPIFFEID extrait l'URI SAN SPIFFE du cert client présenté en mTLS.
// Renvoie "" si aucun cert n'a été présenté ou si aucun URI SAN n'est trouvé.
func PeerSPIFFEID(r *http.Request) string {
	if r == nil || r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
		return ""
	}
	for _, u := range r.TLS.PeerCertificates[0].URIs {
		if u != nil && strings.HasPrefix(strings.ToLower(u.Scheme), "spiffe") {
			return u.String()
		}
	}
	return ""
}

// RequireServiceCallerHTTP est un middleware net/http qui exige un cert client
// dont l'URI SAN SPIFFE figure dans `allowed`. Utile depuis n'importe quelle
// stack (gin, mux, chi, http.ServeMux). Renvoie 401 si pas de cert, 403 si SPIFFE
// inconnu.
//
//	allowed := internalsec.AllowedSet(
//	    "spiffe://cloudity.local/ns/default/sa/api-gateway",
//	)
//	mux.Handle("/internal/", internalsec.RequireServiceCallerHTTP(allowed)(handler))
func RequireServiceCallerHTTP(allowed map[string]bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
				writeJSONError(w, http.StatusUnauthorized, "client certificate required")
				return
			}
			id := PeerSPIFFEID(r)
			if id == "" || !allowed[id] {
				writeJSONError(w, http.StatusForbidden, "service caller not allowed")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// AllowedSet construit l'ensemble (avec sémantique map[string]bool) attendu
// par RequireServiceCallerHTTP. Strip les espaces, ignore les vides.
func AllowedSet(ids ...string) map[string]bool {
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		out[id] = true
	}
	return out
}

// AllowedSetFromCSV lit MTLS_ALLOWED_PEERS (csv) en map[string]bool.
func AllowedSetFromCSV(csv string) map[string]bool {
	if csv == "" {
		return nil
	}
	parts := strings.Split(csv, ",")
	return AllowedSet(parts...)
}

// loadCAPool lit un bundle PEM (root + intermediate). Renvoie nil pool autorisé
// si CAFile est vide en ModePermissive ; en strict, on exige toujours un pool.
func loadCAPool(caFile string) (*x509.CertPool, error) {
	if caFile == "" {
		return nil, errors.New("CA file path is empty")
	}
	pem, err := os.ReadFile(caFile)
	if err != nil {
		return nil, fmt.Errorf("read CA: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pem) {
		return nil, errors.New("invalid CA bundle (no certs found)")
	}
	return pool, nil
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func writeJSONError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	// Écriture minimale, sans deps externes.
	_, _ = w.Write([]byte(`{"error":` + jsonString(msg) + `}`))
}

func jsonString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\n':
			b.WriteString(`\n`)
		case '\r':
			b.WriteString(`\r`)
		case '\t':
			b.WriteString(`\t`)
		default:
			if r < 0x20 {
				b.WriteString(fmt.Sprintf(`\u%04x`, r))
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}
