# mTLS interne — défense en profondeur entre microservices Cloudity

> **Rôle** : plan d’**activation progressive** du mTLS entre l’`api-gateway` et les services Go (`auth-service`, `password-manager`, `mail-directory-service`, `drive-service`, `photos-service`, …) **et** Python (`admin-service`). Vision globale : **[SECURITE.md](./SECURITE.md)** § 5 (Zero Trust). État actuel : **[SECURITE-DONNEES.md](./SECURITE-DONNEES.md)** « Inter-services HTTP plain ». Audit admin : **[AUDIT-SECURITE-ADMIN-API.md](./AUDIT-SECURITE-ADMIN-API.md)**. Cible **post-quantique** : **[STATUS.md](../STATUS.md)** § 2.3 (lignes mTLS interne / certs hybrides).

**Pourquoi avant le PQ** : le mTLS classique est un **prérequis**. On stabilise la **PKI interne**, la **rotation**, l’**audit** et les **patterns de code** d’abord ; on bascule en **certs hybrides ML-DSA + ECDSA** ensuite, quand la chaîne (`crypto/x509`, `tls`, `step-ca`, OpenSSL) supporte les algos PQ.

---

## 1. État actuel (résumé code)

| Brique | État | Source |
|--------|------|--------|
| Réseau Docker `cloudity-network` | en clair | `docker-compose.yml` |
| `api-gateway` ↔ services | HTTP plain | `backend/api-gateway/main.go` |
| Postgres | DSN `sslmode=disable` | `docker-compose.yml` |
| Redis | mot de passe seul, pas de TLS | `docker-compose.yml` |
| `admin-service` | derrière la gateway, **ne revalide pas systématiquement le JWT** | `AUDIT-SECURITE-ADMIN-API.md` § 3 |

**Conséquence** : un attaquant qui pivote sur le réseau Docker peut **lire** ou **rejouer** des appels internes ; le seul rempart est l’isolation Docker. **Insuffisant** dès qu’on ouvre l’infra à plusieurs hôtes / Kubernetes / cloud.

---

## 2. Cible

| Lien | Authentification | Confidentialité | Identité de workload |
|------|------------------|------------------|----------------------|
| **Browser ↔ gateway** | JWT (RS256, palier Ed25519, cible ML-DSA hybride) | TLS 1.3 (cible hybride `X25519MLKEM768`) | utilisateur final |
| **Gateway ↔ service** | **mTLS** (cert client + cert serveur) + JWT pour la **scope/identité utilisateur** | **TLS 1.3** | **SPIFFE-like** : `spiffe://cloudity.local/ns/default/sa/<service>` |
| **Service ↔ service** | mTLS (sans JWT s’il s’agit d’une action **machine**, sinon JWT propagé) | TLS 1.3 | idem |
| **Service ↔ Postgres** | TLS + (optionnel) cert client (`sslmode=verify-full`) | TLS | utilisateur DB par service |
| **Service ↔ Redis** | TLS + AUTH | TLS | utilisateur ACL (Redis 6+) |

**Principe** : le **JWT** parle de l’**utilisateur** ; le **certificat** parle du **workload**. Les deux sont vérifiés séparément à chaque hop.

---

## 3. PKI interne : `step-ca`

### 3.1 Pourquoi `step-ca`

- Open source, conçu pour les **PKI courtes** (certs 24 h ↔ 7 j).  
- ACME interne (compatible cert-manager si on passe à Kubernetes).  
- Provisioners JWT / X5C / OIDC pour automatiser l’émission.  
- Roadmap PQ active (signatures hybrides en discussion).

Alternatives valables : **Vault PKI**, **cert-manager + private CA**, **Smallstep cloud**. Choix par défaut **on-prem** = `step-ca` local dans Docker.

### 3.2 Topologie cible

```
┌──────────────────────────────────────────────────────────────────────┐
│  step-ca (root + intermediate CA, hors-ligne pour root)              │
│   • root CA  : conservée hors-ligne, ML-DSA + ECDSA hybride à terme  │
│   • int. CA  : courte durée, signature des certs services            │
└───────┬──────────────────────────────────────────────────────────────┘
        │ (provisioner JWT / ACME)
   ┌────┴────────────────────────────┐
   │  cloudity-services (Docker)     │
   │   gateway, auth, drive, photos, │
   │   mail-directory, pass, admin…  │
   └──────────────────────────────────┘
```

- **Root CA** : générée **une fois**, conservée **hors-ligne** (clé sur disque chiffré, hors machine de prod). Signe **uniquement** l’**intermediate CA**.  
- **Intermediate CA** : signe les **certs services** (durée 24 h en dev, 7 j en prod).  
- **Certs services** : SAN = `{service}.cloudity.local`, **URI SAN** = `spiffe://cloudity.local/ns/default/sa/{service}` (utile pour ABAC fin).

### 3.3 `docker-compose` (extrait à ajouter dans `docker-compose.services.yml`)

```yaml
services:
  step-ca:
    image: smallstep/step-ca:latest
    container_name: cloudity-step-ca
    environment:
      DOCKER_STEPCA_INIT_NAME: "Cloudity Internal"
      DOCKER_STEPCA_INIT_DNS_NAMES: "step-ca,localhost"
      DOCKER_STEPCA_INIT_PROVISIONER_NAME: "cloudity-jwt"
      DOCKER_STEPCA_INIT_PASSWORD_FILE: "/secrets/ca-password"
    volumes:
      - step_ca_data:/home/step
      - ./infrastructure/step-ca/secrets:/secrets:ro
    ports:
      - "6443:9000"     # ACME / API step-ca exposée seulement en dev
    networks:
      - cloudity-network

volumes:
  step_ca_data:
    driver: local
```

> Le mot de passe d’init est généré une fois (`step ca init`) et copié dans `infrastructure/step-ca/secrets/ca-password` (ignoré par git, comme `.env`).

### 3.4 Workflow d’émission

| Étape | Outil | Détail |
|-------|-------|--------|
| **Boot service** | `step-cli` (ou client ACME Go) | demande un cert avec **provisioner JWT** scopé au nom du service. |
| **Renew** | sidecar **`step ca renew`** (ou worker en goroutine) | renew **avant 2/3 de la durée**. |
| **Stockage cert** | tmpfs (`/run/step/<service>/`) | jamais sur volume persistant. |
| **Reload TLS** | `tls.Config.GetCertificate` lit le fichier à chaque handshake | pas de redémarrage. |

---

## 4. Patterns de code (Go)

### 4.1 Serveur — accepter mTLS, basculer en *strict* progressivement

```go
package internalsec

import (
    "crypto/tls"
    "crypto/x509"
    "errors"
    "fmt"
    "os"
    "sync/atomic"
)

// Mode permet de déployer mTLS sans tout casser :
//   - "off"     : pas de TLS (état actuel, prod legacy uniquement).
//   - "permissive" : TLS exigé, mais cert client optionnel (ramp-up).
//   - "strict"  : TLS + cert client obligatoire et vérifié (cible).
type Mode string

const (
    ModeOff        Mode = "off"
    ModePermissive Mode = "permissive"
    ModeStrict     Mode = "strict"
)

func ServerTLS(mode Mode, certPath, keyPath, caPath string) (*tls.Config, error) {
    if mode == ModeOff {
        return nil, nil
    }
    pool := x509.NewCertPool()
    caPEM, err := os.ReadFile(caPath)
    if err != nil {
        return nil, fmt.Errorf("read CA: %w", err)
    }
    if !pool.AppendCertsFromPEM(caPEM) {
        return nil, errors.New("invalid CA bundle")
    }

    // GetCertificate permet le reload sans restart (sidecar step renew).
    var current atomic.Pointer[tls.Certificate]
    reload := func() error {
        c, err := tls.LoadX509KeyPair(certPath, keyPath)
        if err != nil {
            return err
        }
        current.Store(&c)
        return nil
    }
    if err := reload(); err != nil {
        return nil, err
    }

    cfg := &tls.Config{
        MinVersion: tls.VersionTLS13,
        ClientCAs:  pool,
        GetCertificate: func(*tls.ClientHelloInfo) (*tls.Certificate, error) {
            return current.Load(), nil
        },
    }
    switch mode {
    case ModePermissive:
        cfg.ClientAuth = tls.VerifyClientCertIfGiven
    case ModeStrict:
        cfg.ClientAuth = tls.RequireAndVerifyClientCert
    }
    return cfg, nil
}
```

### 4.2 Client — propager le JWT utilisateur **et** porter le cert workload

```go
func InternalHTTPClient(certPath, keyPath, caPath string) (*http.Client, error) {
    cert, err := tls.LoadX509KeyPair(certPath, keyPath)
    if err != nil {
        return nil, err
    }
    pool := x509.NewCertPool()
    if pem, err := os.ReadFile(caPath); err == nil {
        pool.AppendCertsFromPEM(pem)
    }
    return &http.Client{
        Timeout: 5 * time.Second,
        Transport: &http.Transport{
            TLSClientConfig: &tls.Config{
                MinVersion:   tls.VersionTLS13,
                Certificates: []tls.Certificate{cert},
                RootCAs:      pool,
            },
        },
    }, nil
}
```

> Convention : la **gateway** propage `Authorization: Bearer <jwt>` ET monte un cert client. Le service downstream **vérifie** d’abord le **cert** (workload) puis **revalide** le **JWT** (utilisateur). C’est la défense en profondeur réclamée dans `AUDIT-SECURITE-ADMIN-API.md` § 3.

### 4.3 Vérification d’identité workload côté serveur

```go
func RequireServiceCaller(allowed map[string]bool) gin.HandlerFunc {
    return func(c *gin.Context) {
        if c.Request.TLS == nil || len(c.Request.TLS.PeerCertificates) == 0 {
            c.AbortWithStatus(http.StatusUnauthorized)
            return
        }
        leaf := c.Request.TLS.PeerCertificates[0]
        for _, uri := range leaf.URIs {
            if allowed[uri.String()] {
                c.Next()
                return
            }
        }
        c.AbortWithStatus(http.StatusForbidden)
    }
}
```

Liste *whitelist* (ex.) :

```go
allowed := map[string]bool{
    "spiffe://cloudity.local/ns/default/sa/api-gateway": true,
    "spiffe://cloudity.local/ns/default/sa/auth-service": true,
}
```

---

## 5. Plan de migration (sans casser la prod)

| Étape | Durée typique | Action | Critère de sortie |
|-------|---------------|--------|--------------------|
| **1. Préparer step-ca** | 1 jour | `docker compose up step-ca` ; provisioner JWT ; export du **bundle CA** dans un volume partagé `cloudity-ca`. | `curl https://step-ca:9000/health` OK. |
| **2. Émettre les certs services** | 1 jour | sidecar `step ca certificate` au boot ; renew automatique. | chaque service écrit `cert.pem` / `key.pem` dans tmpfs. |
| **3. Mode `permissive` côté serveurs** | 1 sprint | les services exposent `https://` (TLS exigé), **cert client facultatif**. La gateway parle déjà en HTTPS sans cert client. Métrique : `% appels avec cert client`. | aucun crash, `% mTLS` croît tous les jours. |
| **4. Mode `permissive` côté clients (gateway en tête)** | 1 sprint | la gateway monte son cert client ; chaque service Go aussi. | `% mTLS` ≥ 99 %. |
| **5. Mode `strict` côté serveurs** | 1 jour, prévu en heure creuse | bascule `MTLS_MODE=strict` partout ; rollback = `permissive`. | aucun 5xx hors fenêtre attendue. |
| **6. Postgres TLS** | 1 sprint | `sslmode=verify-full`, certs client par service ; `pg_hba.conf` durci. | logs `ssl on` côté Postgres pour 100 % des conns. |
| **7. Redis TLS** | 1 sprint | Redis 7 `tls-port 6379`, ACL par service. | tous les services connectés en `rediss://`. |
| **8. Admin-service revalide JWT** | 0,5 sprint | middleware Python qui vérifie la signature avec la clé publique JWT (montée en volume), ferme la dette `AUDIT-SECURITE-ADMIN-API.md` § 3. | tests `make test-security` couvrent un JWT fabriqué côté gateway compromis. |
| **9. Bascule PQ-hybride** | quand la PKI tient (≥ 1 trimestre stable) | activer émission de certs **ML-DSA + ECDSA** ; `tls.Config` reste compatible (sigschemes). | handshake hybride observé sur 100 % des liens internes. |

---

## 6. Variables d’environnement standard

| Variable | Défaut | Sens |
|----------|--------|------|
| `MTLS_MODE` | `off` | `off` / `permissive` / `strict`. Pilote `internalsec.ServerTLS`. |
| `MTLS_CERT_FILE` | `/run/step/<svc>/cert.pem` | cert workload. |
| `MTLS_KEY_FILE` | `/run/step/<svc>/key.pem` | clé privée workload (tmpfs). |
| `MTLS_CA_FILE` | `/run/step/ca.pem` | bundle CA interne. |
| `MTLS_ALLOWED_PEERS` | (liste séparée par `,`) | URIs SPIFFE acceptées. |
| `JWT_PUBLIC_KEY_FILE` | `/run/auth/jwt-pub.pem` | nécessaire à la **revalidation downstream**. |

> Ces noms sont **uniformes** sur tous les services Go et Python — aligner `Makefile` (`make seed-mtls`, `make rotate-mtls`).

---

## 7. Tests

- **Unitaires** (`internalsec_test.go`) : `ModeStrict` rejette un client sans cert ; `RequireServiceCaller` rejette un URI inconnu.  
- **Intégration** : un service `auth-service` lance un mini-serveur TLS, la gateway l’appelle avec et sans cert ; `make test-security` doit couvrir le scénario.  
- **End-to-end** : `make up` + `make seed-mtls` ; `curl --cacert` depuis l’hôte ; le proxy doit refuser `curl` sans cert client en mode strict.  
- **Rotation** : `step ca renew` simulée toutes les 30 s pendant 5 min ; le service ne doit **pas** redémarrer ni rater une requête.  
- **PQ** (à venir) : un build avec **`circl`** signe un cert hybride ; `tls.Config` négocie le bon `SignatureScheme`.

---

## 8. Anti-patterns

- ❌ Émettre des certs **un an** : impossible à révoquer en pratique. **Cible 24 h–7 j**, renew automatique.  
- ❌ Stocker la clé privée du service sur **volume Docker persistant** : tmpfs uniquement.  
- ❌ Mélanger mTLS et **secret partagé** dans le même handshake : choisir un seul axe par lien.  
- ❌ Signer un cert client **sans `URI SAN`** : la liste blanche `RequireServiceCaller` perd son sens.  
- ❌ Baser **uniquement** la sécurité sur le mTLS : continuer à exiger **JWT utilisateur** sur les routes métier (le certif ne sait pas qui est l’utilisateur).

---

## 9. Liens

- **[SECURITE.md](./SECURITE.md)** § 5 (Zero Trust) et § 8 (post-quantique).  
- **[AUDIT-SECURITE-ADMIN-API.md](./AUDIT-SECURITE-ADMIN-API.md)** § 3 (dette admin-service).  
- **[STATUS.md](../STATUS.md)** § 2.3 (cible chiffrement, ligne mTLS interne).  
- **[REVERSE-PROXY.md](./REVERSE-PROXY.md)** (à créer) — couche externe : TLS 1.3, HSTS, CSP, hybride PQ.  
- `README.md` (racine) — sketch historique d’un `SetupMTLS()` à remplacer par `internalsec` documenté ici.

*Document à mettre à jour dès que l’étape 1 (step-ca) est lancée en local — ajouter alors les commandes `make` réelles (ex. `make seed-mtls`).*
