package internalsec

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// --- Helpers test ---

type genCert struct {
	certPEM []byte
	keyPEM  []byte
	cert    *x509.Certificate
	priv    *ecdsa.PrivateKey
}

func generateCert(t *testing.T, isCA bool, parent *genCert, cn string, spiffeURI string, dnsNames []string) *genCert {
	t.Helper()
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("ecdsa key: %v", err)
	}
	serial, _ := rand.Int(rand.Reader, big.NewInt(1<<62))
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Minute),
		NotAfter:     time.Now().Add(2 * time.Hour),
		IsCA:         isCA,
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment | x509.KeyUsageCertSign,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		BasicConstraintsValid: true,
		DNSNames:              dnsNames,
	}
	if spiffeURI != "" {
		u, err := url.Parse(spiffeURI)
		if err != nil {
			t.Fatalf("parse SPIFFE URI: %v", err)
		}
		tmpl.URIs = []*url.URL{u}
	}
	signer := tmpl
	signerKey := priv
	if parent != nil {
		signer = parent.cert
		signerKey = parent.priv
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, signer, &priv.PublicKey, signerKey)
	if err != nil {
		t.Fatalf("create cert: %v", err)
	}
	parsed, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse cert: %v", err)
	}
	keyDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	return &genCert{
		certPEM: pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}),
		keyPEM:  pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}),
		cert:    parsed,
		priv:    priv,
	}
}

func writePEM(t *testing.T, dir, name string, content []byte) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, content, 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return p
}

// --- ParseMode ---

func TestParseMode(t *testing.T) {
	cases := map[string]Mode{
		"":           ModeOff,
		"off":        ModeOff,
		"DISABLED":   ModeOff,
		"unknown":    ModeOff,
		"permissive": ModePermissive,
		" Strict ":   ModeStrict,
	}
	for in, want := range cases {
		if got := ParseMode(in); got != want {
			t.Errorf("ParseMode(%q) = %q, want %q", in, got, want)
		}
	}
}

// --- ServerTLS / ClientTLS / handshake bout-en-bout ---

func TestServerTLSOff(t *testing.T) {
	cfg, reload, err := ServerTLS(ServerConfig{Mode: ModeOff})
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if cfg != nil || reload != nil {
		t.Errorf("ModeOff doit retourner (nil, nil)")
	}
}

func TestServerTLSStrictHandshake(t *testing.T) {
	dir := t.TempDir()

	ca := generateCert(t, true, nil, "Cloudity Test CA", "", nil)
	server := generateCert(t, false, ca, "auth-service", "spiffe://cloudity.local/ns/default/sa/auth-service", []string{"localhost", "127.0.0.1"})
	client := generateCert(t, false, ca, "api-gateway", "spiffe://cloudity.local/ns/default/sa/api-gateway", nil)

	caPath := writePEM(t, dir, "ca.pem", ca.certPEM)
	srvCert := writePEM(t, dir, "server.crt", server.certPEM)
	srvKey := writePEM(t, dir, "server.key", server.keyPEM)
	cliCert := writePEM(t, dir, "client.crt", client.certPEM)
	cliKey := writePEM(t, dir, "client.key", client.keyPEM)

	tlsCfg, _, err := ServerTLS(ServerConfig{
		Mode: ModeStrict, CertFile: srvCert, KeyFile: srvKey, CAFile: caPath,
	})
	if err != nil {
		t.Fatalf("ServerTLS strict: %v", err)
	}

	allowed := AllowedSet("spiffe://cloudity.local/ns/default/sa/api-gateway")
	mux := http.NewServeMux()
	mux.HandleFunc("/internal/whoami", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(PeerSPIFFEID(r)))
	})
	handler := RequireServiceCallerHTTP(allowed)(mux)

	srv := httptest.NewUnstartedServer(handler)
	srv.TLS = tlsCfg
	srv.StartTLS()
	defer srv.Close()

	cliTLS, err := ClientTLS(ServerConfig{CertFile: cliCert, KeyFile: cliKey, CAFile: caPath})
	if err != nil {
		t.Fatalf("ClientTLS: %v", err)
	}
	cliTLS.ServerName = "localhost"
	cliHTTP := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{TLSClientConfig: cliTLS},
	}

	resp, err := cliHTTP.Get(srv.URL + "/internal/whoami")
	if err != nil {
		t.Fatalf("client get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status: %d", resp.StatusCode)
	}
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	got := strings.TrimSpace(string(buf[:n]))
	want := "spiffe://cloudity.local/ns/default/sa/api-gateway"
	if got != want {
		t.Errorf("PeerSPIFFEID = %q, want %q", got, want)
	}
}

func TestServerTLSStrictRejectsNoClientCert(t *testing.T) {
	dir := t.TempDir()
	ca := generateCert(t, true, nil, "Cloudity Test CA", "", nil)
	server := generateCert(t, false, ca, "auth", "", []string{"localhost", "127.0.0.1"})
	caPath := writePEM(t, dir, "ca.pem", ca.certPEM)
	srvCert := writePEM(t, dir, "server.crt", server.certPEM)
	srvKey := writePEM(t, dir, "server.key", server.keyPEM)

	tlsCfg, _, err := ServerTLS(ServerConfig{
		Mode: ModeStrict, CertFile: srvCert, KeyFile: srvKey, CAFile: caPath,
	})
	if err != nil {
		t.Fatalf("ServerTLS: %v", err)
	}
	srv := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	srv.TLS = tlsCfg
	srv.StartTLS()
	defer srv.Close()

	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(ca.certPEM)
	cliHTTP := &http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS13,
			RootCAs:    pool,
			ServerName: "localhost",
		}},
	}
	if _, err := cliHTTP.Get(srv.URL); err == nil {
		t.Fatal("expected handshake error in strict mode without client cert, got nil")
	}
}

// --- RequireServiceCallerHTTP : codes 401/403 sans TLS ---

func TestRequireServiceCallerHTTP_NoTLS(t *testing.T) {
	allowed := AllowedSet("spiffe://cloudity.local/ns/default/sa/api-gateway")
	called := false
	h := RequireServiceCallerHTTP(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	}))
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/internal/whoami", nil)
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
	if called {
		t.Error("handler should not be called without client cert")
	}
}

// --- AllowedSet / AllowedSetFromCSV ---

func TestAllowedSetFromCSV(t *testing.T) {
	got := AllowedSetFromCSV(" a , , b ,a ")
	if !got["a"] || !got["b"] || len(got) != 2 {
		t.Errorf("AllowedSetFromCSV = %v, want {a,b}", got)
	}
	if AllowedSetFromCSV("") != nil {
		t.Error("empty CSV must return nil")
	}
}

// --- ConfigFromEnv : sanity check ---

func TestConfigFromEnv(t *testing.T) {
	t.Setenv("MTLS_MODE", "permissive")
	t.Setenv("MTLS_CERT_FILE", "/tmp/x.crt")
	t.Setenv("MTLS_KEY_FILE", "/tmp/x.key")
	t.Setenv("MTLS_CA_FILE", "/tmp/ca.pem")
	cfg := ConfigFromEnv()
	if cfg.Mode != ModePermissive {
		t.Errorf("Mode: %s", cfg.Mode)
	}
	if cfg.CertFile != "/tmp/x.crt" || cfg.KeyFile != "/tmp/x.key" || cfg.CAFile != "/tmp/ca.pem" {
		t.Errorf("paths not picked up: %+v", cfg)
	}
}
