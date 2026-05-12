package internalsec

import (
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// TestStepCAIssuedCertsHandshake fait un handshake mTLS bout-en-bout en
// utilisant les certs émis par `make mtls-poc` (infrastructure/step-ca/issued/).
//
// Pré-requis : `make mtls-up && make seed-mtls && make mtls-issue NAME=api-gateway
// && make mtls-issue NAME=auth-service`. Sinon le test est SKIPPED — on garde la
// suite verte en CI sans step-ca.
func TestStepCAIssuedCertsHandshake(t *testing.T) {
	if os.Getenv("INTERNALSEC_STEPCA_INTEGRATION") != "1" {
		t.Skip("set INTERNALSEC_STEPCA_INTEGRATION=1 to run (requires `make mtls-poc`)")
	}

	root, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	repo := filepath.Clean(filepath.Join(root, "..", ".."))
	srvDir := filepath.Join(repo, "infrastructure/step-ca/issued/auth-service")
	cliDir := filepath.Join(repo, "infrastructure/step-ca/issued/api-gateway")
	for _, p := range []string{
		filepath.Join(srvDir, "cert.pem"), filepath.Join(srvDir, "key.pem"), filepath.Join(srvDir, "ca.pem"),
		filepath.Join(cliDir, "cert.pem"), filepath.Join(cliDir, "key.pem"),
	} {
		if _, err := os.Stat(p); err != nil {
			t.Skipf("missing %s — run `make mtls-poc` first", p)
		}
	}

	tlsCfg, _, err := ServerTLS(ServerConfig{
		Mode:     ModeStrict,
		CertFile: filepath.Join(srvDir, "cert.pem"),
		KeyFile:  filepath.Join(srvDir, "key.pem"),
		CAFile:   filepath.Join(srvDir, "ca.pem"),
	})
	if err != nil {
		t.Fatalf("ServerTLS: %v", err)
	}

	allowed := AllowedSet("spiffe://cloudity.local/ns/default/sa/api-gateway")
	mux := http.NewServeMux()
	mux.HandleFunc("/internal/whoami", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(PeerSPIFFEID(r)))
	})
	srv := httptest.NewUnstartedServer(RequireServiceCallerHTTP(allowed)(mux))
	srv.TLS = tlsCfg
	srv.StartTLS()
	defer srv.Close()

	cliTLS, err := ClientTLS(ServerConfig{
		CertFile: filepath.Join(cliDir, "cert.pem"),
		KeyFile:  filepath.Join(cliDir, "key.pem"),
		CAFile:   filepath.Join(srvDir, "ca.pem"),
	})
	if err != nil {
		t.Fatalf("ClientTLS: %v", err)
	}
	cliTLS.ServerName = "localhost"
	httpc := &http.Client{
		Timeout:   5 * time.Second,
		Transport: &http.Transport{TLSClientConfig: cliTLS},
	}

	resp, err := httpc.Get(srv.URL + "/internal/whoami")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d", resp.StatusCode)
	}
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	got := strings.TrimSpace(string(buf[:n]))
	want := "spiffe://cloudity.local/ns/default/sa/api-gateway"
	if got != want {
		t.Errorf("PeerSPIFFEID = %q, want %q (TLS version=%x)", got, want, resp.TLS.Version)
	}
	if resp.TLS == nil || resp.TLS.Version < tls.VersionTLS13 {
		t.Errorf("TLS version below 1.3 (got %v)", resp.TLS)
	}
}
