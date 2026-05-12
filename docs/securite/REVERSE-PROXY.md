# Reverse-proxy edge — TLS 1.3 strict, HSTS, CSP, **hybride post-quantique**

> **Rôle** : configuration **prête à coller** pour la couche **edge** entre Internet et la stack Cloudity (gateway sur `:6080`, web sur `:6001`). Vise un **A+ SSL Labs / Mozilla Observatory** dès la mise en service, en gardant un chemin **propre** vers le **post-quantique**. Vision globale : **[SECURITE.md](SECURITE.md)** § 4–6 (signatures, Zero Trust, WAF) et § 8 (PQ). Tableau d’algos : **[STATUS.md](../../STATUS.md)** § 2.3. État actuel + dettes : **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)**. Pendant interne : **[MTLS-INTERNE.md](MTLS-INTERNE.md)**.

**Choix par défaut** : **Caddy 2.8+** en prod (TLS automatique, HTTP/3, support PQ tôt). Alternatives valables : **nginx + OpenSSL 3.5+**, **Traefik 3+**. Les trois gabarits sont fournis pour rester portable.

> **Référentiel crypto obligatoire** : **[CRYPTO-NORME.md](CRYPTO-NORME.md)** § 1.6 (TLS) et § 4.2 (reverse-proxy public). Toute config doit y être conforme.

### Décisions produit (cf. `docs/decisions/multi-repo/REPONSES.md`)

| Code | Décision | Statut |
|------|----------|--------|
| **Q18=A** | **HTTP/3 (QUIC)** activé dès la mise en prod (Caddy 2.6+ ou nginx 1.25+) | gabarits ci-dessous prêts ; UDP/443 à ouvrir au firewall |
| **Q19=A** | **Hybride post-quantique** TLS public `X25519MLKEM768` activé dès la mise en prod | Caddy 2.8+ tient la promesse out-of-the-box ; nginx + OpenSSL 3.5+ via `ssl_ecdh_curve` |

---

## 1. Topologie cible

```
Internet ──HTTPS (TLS 1.3 hybride)──►  reverse-proxy  ──HTTPS+mTLS──►  api-gateway (6080)
                                                       └──HTTPS+mTLS──►  cloudity-web (6001)
```

- **Reverse-proxy** : termine TLS, applique en-têtes sécu, fait du **rate-limit** edge, route par **hostname**.  
- **mTLS interne** : voir **[MTLS-INTERNE.md](MTLS-INTERNE.md)**. Le reverse-proxy est **un client mTLS** comme un autre service.  
- **WAF** (ModSecurity / CRS) : voir **[SECURITE.md](SECURITE.md)** § 6 ; activé en **mode détection** d’abord.

**DNS minimum** (cf. STATUS.md § 2.4) :

| Sous-domaine | Backend |
|--------------|---------|
| `api.cloudity.example.com` | api-gateway (`:6080`) |
| `app.cloudity.example.com` | cloudity-web (`:6001`) |
| `admin.cloudity.example.com` (option) | cloudity-web (`/4dm1n`) — sinon partagé avec `app.` |

---

## 2. Cibles concrètes (à respecter dans toute conf)

| Item | Valeur |
|------|--------|
| **TLS** | **1.3 only** (pas de 1.2 sauf transition courte) |
| **Cipher suites TLS 1.3** | `TLS_AES_256_GCM_SHA384`, `TLS_CHACHA20_POLY1305_SHA256`, `TLS_AES_128_GCM_SHA256` |
| **Groupes (key exchange)** | **`X25519MLKEM768`** (hybride PQ), `X25519`, `secp384r1` (fallback) |
| **OCSP stapling** | activé |
| **Session tickets** | clés rotées toutes les 24 h, **pas** de ticket persistant cross-restart |
| **HSTS** | `max-age=31536000; includeSubDomains` ; **`preload`** après stabilisation + soumission `hstspreload.org` |
| **HTTP/2 + HTTP/3** | activés |
| **HTTP→HTTPS** | redirection 301 stricte |
| **CSP** | `default-src 'self'` + `connect-src 'self' https://api.cloudity.example.com` ; **report-only d’abord** |
| **Permissions-Policy** | tout `()` sauf besoins explicites |
| **Cross-Origin-*** | `COOP=same-origin`, `CORP=same-origin`, `COEP=require-corp` (à ajuster si embeds tiers) |
| **Headers retirés** | `Server`, `X-Powered-By` |

---

## 3. Caddy (recommandé)

### 3.1 `Caddyfile`

```caddy
{
    email ops@cloudity.example.com
    auto_https on
    servers {
        protocols h1 h2 h3
    }
    # Caddy 2.8+ active automatiquement le groupe hybride X25519MLKEM768
    # quand BoringSSL/AWS-LC/OpenSSL 3.5+ est dispo dans la build.
}

(security_headers) {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        # Activer "preload" après plusieurs semaines sans incident :
        # Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()"
        Cross-Origin-Opener-Policy "same-origin"
        Cross-Origin-Resource-Policy "same-origin"
        # COEP : casse les ressources tierces non opt-in. Mettre seulement quand tout sert depuis 'self'.
        # Cross-Origin-Embedder-Policy "require-corp"
        -Server
        -X-Powered-By
    }
}

# --- API gateway ---
api.cloudity.example.com {
    import security_headers

    # CSP minimaliste pour l'API (pas de HTML servi).
    header Content-Security-Policy "default-src 'none'; frame-ancestors 'none'"

    @options method OPTIONS
    handle @options {
        respond "" 204
    }

    reverse_proxy https://api-gateway:8000 {
        # mTLS interne (cf. MTLS-INTERNE.md).
        transport http {
            tls
            tls_trusted_ca_certs /run/step/ca.pem
            tls_client_auth /run/step/proxy/cert.pem /run/step/proxy/key.pem
        }
        header_up X-Forwarded-Proto https
        header_up X-Forwarded-For {remote}
    }
}

# --- App web (SPA + admin /4dm1n) ---
app.cloudity.example.com {
    import security_headers

    # CSP : commencer en report-only, durcir progressivement.
    header Content-Security-Policy-Report-Only "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.cloudity.example.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri https://api.cloudity.example.com/csp-report"

    # Une fois propre, basculer en enforce :
    # header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.cloudity.example.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"

    encode zstd gzip

    reverse_proxy https://cloudity-web:3000 {
        transport http {
            tls
            tls_trusted_ca_certs /run/step/ca.pem
            tls_client_auth /run/step/proxy/cert.pem /run/step/proxy/key.pem
        }
        header_up X-Forwarded-Proto https
        header_up X-Forwarded-For {remote}
    }
}
```

### 3.2 Notes Caddy

- **TLS 1.3 only** : Caddy 2.8+ accepte `tls { protocols tls1.3 }` mais c’est déjà le défaut quand on n’ouvre pas TLS 1.2 explicitement.  
- **PQ hybride** : la build officielle de Caddy basée sur **`crypto/tls`** Go 1.23+ propose **`X25519Kyber768Draft00`** ; pour **`X25519MLKEM768`** standardisé, viser Caddy 2.9+/Go 1.24+. Le code applicatif **n’a rien à faire**.  
- **HTTP/3** : actif dès `protocols h3` ; ouvrir UDP/443 dans le firewall.  
- **`-Server`** retire l’en-tête `Server` exposant la version (recommandation OWASP).

---

## 4. nginx (alternative)

`/etc/nginx/conf.d/cloudity.conf` :

```nginx
# TLS 1.3 strict + groupes hybrides PQ (nginx + OpenSSL 3.5+ ou BoringSSL).
ssl_protocols TLSv1.3;
ssl_ciphers TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256;
ssl_prefer_server_ciphers off;
# OpenSSL 3.5+ supporte X25519MLKEM768 ; sinon X25519 seul.
ssl_ecdh_curve X25519MLKEM768:X25519:secp384r1;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_session_tickets off;
ssl_stapling on;
ssl_stapling_verify on;

resolver 1.1.1.1 9.9.9.9 valid=300s;
resolver_timeout 5s;

# HTTP -> HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name api.cloudity.example.com app.cloudity.example.com;
    return 301 https://$host$request_uri;
}

# Bloc commun en-têtes sécurité (à inclure)
map $sent_http_content_type $cloudity_csp {
    default "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.cloudity.example.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests";
}

# --- API gateway ---
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    http3 on;
    server_name api.cloudity.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.cloudity.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.cloudity.example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;
    add_header Content-Security-Policy "default-src 'none'; frame-ancestors 'none'" always;

    server_tokens off;

    location / {
        # mTLS interne (cf. MTLS-INTERNE.md).
        proxy_ssl_certificate         /run/step/proxy/cert.pem;
        proxy_ssl_certificate_key     /run/step/proxy/key.pem;
        proxy_ssl_trusted_certificate /run/step/ca.pem;
        proxy_ssl_verify              on;
        proxy_ssl_protocols           TLSv1.3;

        proxy_pass https://api-gateway:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}

# --- App web ---
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    http3 on;
    server_name app.cloudity.example.com;

    ssl_certificate     /etc/letsencrypt/live/app.cloudity.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.cloudity.example.com/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Resource-Policy "same-origin" always;

    # CSP report-only d'abord puis enforce (var $cloudity_csp).
    add_header Content-Security-Policy-Report-Only $cloudity_csp always;

    server_tokens off;

    location / {
        proxy_ssl_certificate         /run/step/proxy/cert.pem;
        proxy_ssl_certificate_key     /run/step/proxy/key.pem;
        proxy_ssl_trusted_certificate /run/step/ca.pem;
        proxy_ssl_verify              on;
        proxy_ssl_protocols           TLSv1.3;

        proxy_pass https://cloudity-web:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

### 4.1 Notes nginx

- **HTTP/3** : `http3 on;` + `quic_retry on;` selon version ; nécessite **nginx 1.25+** compilé avec **QUIC**.  
- **PQ** : `ssl_ecdh_curve` accepte `X25519MLKEM768` à partir **d’OpenSSL 3.5+** ; sinon, simplement `X25519:secp384r1`.  
- Vérifier la conf : `nginx -T | grep ssl_` puis tester avec **`testssl.sh`** ou Mozilla Observatory.

---

## 5. Traefik (alternative cluster)

`traefik.yml` (extrait) :

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
  websecure:
    address: ":443"
    http3: {}
    http:
      tls:
        options: cloudity-strict@file
        certResolver: letsencrypt

tls:
  options:
    cloudity-strict:
      minVersion: VersionTLS13
      curvePreferences:
        - X25519MLKEM768
        - X25519
        - secp384r1
      cipherSuites:
        - TLS_AES_256_GCM_SHA384
        - TLS_CHACHA20_POLY1305_SHA256
        - TLS_AES_128_GCM_SHA256

http:
  middlewares:
    cloudity-headers:
      headers:
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        contentTypeNosniff: true
        referrerPolicy: "strict-origin-when-cross-origin"
        frameDeny: false
        customFrameOptionsValue: "SAMEORIGIN"
        permissionsPolicy: "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()"
        contentSecurityPolicy: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.cloudity.example.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
```

Routeur Docker labels (extrait) :

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.app.rule=Host(`app.cloudity.example.com`)"
  - "traefik.http.routers.app.entrypoints=websecure"
  - "traefik.http.routers.app.middlewares=cloudity-headers@file"
```

---

## 6. CSP — méthodologie pour ne rien casser

1. **Phase 1 — Report-Only**  
   Déployer `Content-Security-Policy-Report-Only` avec une politique **stricte** (pas de `unsafe-inline`/`unsafe-eval` côté `script-src`). Les violations sont POSTées sur **`/csp-report`** (à exposer côté gateway, log JSON).
2. **Phase 2 — Tri**  
   Pour chaque violation : soit on **élimine la cause** (déplacer un `<script>` inline dans un fichier, ajouter un nonce, etc.), soit on **élargit la directive** (ajouter une origine).
3. **Phase 3 — Enforce**  
   Basculer en `Content-Security-Policy` quand le rapport est vide pendant **≥ 2 semaines** sur les pages clés.
4. **Phase 4 — Durcissement**  
   - Retirer `'unsafe-inline'` du `style-src` (utiliser un nonce ou des CSS modules).  
   - Activer `Cross-Origin-Embedder-Policy: require-corp` quand toutes les ressources servent en `same-origin` (utile pour `SharedArrayBuffer` / WASM).  
   - Ajouter `Reporting-Endpoints` + `Report-To` (NEL, CSP).

---

## 7. Tests automatisés

| Test | Commande / outil |
|------|------------------|
| **TLS suites + protocoles** | `testssl.sh https://app.cloudity.example.com` (objectif : pas de TLS<1.3, pas de cipher faible). |
| **Headers** | `curl -sI https://app.cloudity.example.com | grep -i 'strict-transport\|content-security\|x-content-type\|permissions-policy'` |
| **Mozilla Observatory** | `https://observatory.mozilla.org/analyze/app.cloudity.example.com` (cible **A+**). |
| **HSTS preload check** | `https://hstspreload.org/?domain=cloudity.example.com` |
| **CSP report flow** | E2E Playwright qui charge l’app et vérifie 0 violation CSP en console. |
| **Hybride PQ** | `openssl s_client -connect app.cloudity.example.com:443 -groups X25519MLKEM768` (à partir d’OpenSSL 3.5). |

À intégrer dans **`make test-security`** quand le reverse-proxy de pré-prod est branché.

---

## 8. Bascule post-quantique — checklist edge

1. **Caddy 2.8+** ou **nginx + OpenSSL 3.5+** ou **Traefik 3+** déployés.  
2. Liste des `curvePreferences` / `ssl_ecdh_curve` contient **`X25519MLKEM768`** en première position.  
3. Aucune dépendance à un suite cipher classique seule (`X25519` reste en fallback).  
4. **Logs / métriques** : exposer le **groupe négocié** (Caddy `tls.handshake_complete`, nginx `$ssl_curve`) ; alerte si % handshakes hybrides < seuil.  
5. **Clients** vérifiés : Chrome 124+, Firefox 132+, Edge 124+, Safari ≥ 18 selon support — ce qui ne supporte pas l’hybride retombera proprement sur X25519.  
6. Documenter dans **STATUS.md** § 2.3 le **% handshakes hybrides** comme indicateur prod.

---

## 9. Liens

- **[SECURITE.md](SECURITE.md)** — vision et § 8 PQ.  
- **[STATUS.md](../../STATUS.md)** § 2.3 — algorithmes cibles et plan PQ.  
- **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)** — état actuel et pistes priorisées.  
- **[MTLS-INTERNE.md](MTLS-INTERNE.md)** — pendant interne (mTLS step-ca).  
- `frontend/apps/cloudity-web/nginx.conf` — image **applicative** (sert juste les bundles ; en-têtes minimaux + gabarits HSTS/CSP commentés).

*Document à mettre à jour lors du **premier déploiement edge** (pré-prod) — préciser alors le **fournisseur DNS**, le **certResolver** ACME, et la **clé hôte** OCSP.*
