package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/pavel/cloudity/internalsec"
)

// TestAuthServiceListensInTLSWhenMTLSPermissive vérifie qu'un gin.Engine
// servi derrière `internalsec.ServerTLS(ModePermissive)` répond bien en
// HTTPS, et que l'InternalRoundTripper (utilisé côté api-gateway) sait le
// joindre. Couvre la bascule `MTLS_MODE=permissive` ajoutée au boot
// d'auth-service.
func TestAuthServiceListensInTLSWhenMTLSPermissive(t *testing.T) {
	if testing.Short() {
		t.Skip("short mode")
	}
	gin.SetMode(gin.TestMode)

	dir := t.TempDir()
	caPath, srvCert, srvKey := generateTestCert(t, dir, "auth-service")

	tlsCfg, _, err := internalsec.ServerTLS(internalsec.ServerConfig{
		Mode:     internalsec.ModePermissive,
		CertFile: srvCert,
		KeyFile:  srvKey,
		CAFile:   caPath,
	})
	if err != nil {
		t.Fatalf("ServerTLS: %v", err)
	}
	r := gin.New()
	r.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"status": "healthy"}) })

	srv := httptest.NewUnstartedServer(r)
	srv.TLS = tlsCfg
	srv.StartTLS()
	defer srv.Close()

	rt, err := internalsec.InternalRoundTripper(internalsec.ServerConfig{
		Mode:   internalsec.ModePermissive,
		CAFile: caPath,
	})
	if err != nil {
		t.Fatalf("InternalRoundTripper: %v", err)
	}
	rt.(*http.Transport).TLSClientConfig.ServerName = "localhost"
	httpc := &http.Client{Timeout: 5 * time.Second, Transport: rt}
	resp, err := httpc.Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d", resp.StatusCode)
	}
}

// generateTestCert : CA auto-signée + cert serveur SAN=localhost,127.0.0.1.
// Fait pour les tests unitaires uniquement (pas de SAN SPIFFE, pas de
// validation chaîne intermédiaire). Pour le test bout-en-bout avec step-ca,
// voir backend/internalsec/integration_steca_test.go.
func generateTestCert(t *testing.T, dir, cn string) (caFile, certFile, keyFile string) {
	t.Helper()

	caPriv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("ca keygen: %v", err)
	}
	caTpl := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: "Cloudity Test CA"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(time.Hour),
		IsCA:                  true,
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
	}
	caDER, err := x509.CreateCertificate(rand.Reader, caTpl, caTpl, &caPriv.PublicKey, caPriv)
	if err != nil {
		t.Fatalf("ca cert: %v", err)
	}
	caPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: caDER})

	srvPriv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("srv keygen: %v", err)
	}
	srvTpl := &x509.Certificate{
		SerialNumber: big.NewInt(2),
		Subject:      pkix.Name{CommonName: cn},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth, x509.ExtKeyUsageClientAuth},
		DNSNames:     []string{"localhost", cn},
		IPAddresses:  []net.IP{net.ParseIP("127.0.0.1")},
	}
	srvCa, err := x509.ParseCertificate(caDER)
	if err != nil {
		t.Fatalf("parse ca: %v", err)
	}
	srvDER, err := x509.CreateCertificate(rand.Reader, srvTpl, srvCa, &srvPriv.PublicKey, caPriv)
	if err != nil {
		t.Fatalf("srv cert: %v", err)
	}
	srvCertPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: srvDER})
	keyDER, err := x509.MarshalECPrivateKey(srvPriv)
	if err != nil {
		t.Fatalf("srv key marshal: %v", err)
	}
	srvKeyPEM := pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER})

	caFile = filepath.Join(dir, "ca.pem")
	certFile = filepath.Join(dir, "cert.pem")
	keyFile = filepath.Join(dir, "key.pem")
	for path, content := range map[string][]byte{caFile: caPEM, certFile: srvCertPEM, keyFile: srvKeyPEM} {
		if err := os.WriteFile(path, content, 0o600); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}
	return caFile, certFile, keyFile
}
