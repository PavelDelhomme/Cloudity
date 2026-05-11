# Reverse-proxy pré-prod (Caddy)

> **Rôle** : valider en local la couche edge **avant** la prod : TLS 1.3, HSTS, CSP report-only, Permissions-Policy. Référence : **[../../docs/securite/REVERSE-PROXY.md](../../docs/securite/REVERSE-PROXY.md)** (gabarits Caddy / nginx / Traefik) et **[../../docs/securite/SECURITE.md](../../docs/securite/SECURITE.md)** § 8 (cible post-quantique).

## Démarrer

1. Ajouter dans **`/etc/hosts`** (à faire une fois) :

   ```
   127.0.0.1   app.cloudity.local
   127.0.0.1   api.cloudity.local
   ```

2. Lancer :

   ```bash
   make preprod-up
   ```

   La commande superpose `docker-compose.preprod.yml` au compose principal et démarre le service **`caddy`**. Caddy émet des **certs auto-signés internes** (`tls internal`) — votre navigateur affichera un avertissement la première fois (cliquer sur « Avancé → Continuer »).

3. Vérifier :

   - `https://app.cloudity.local` ⇒ shell utilisateur (`/app`, `/login`, `/4dm1n`).
   - `https://api.cloudity.local/health` ⇒ JSON `{"status":"healthy"}`.

4. Inspecter les en-têtes :

   ```bash
   curl -kI https://app.cloudity.local | grep -iE "strict-transport|content-security|permissions-policy|cross-origin"
   ```

5. Arrêter :

   ```bash
   make preprod-down
   ```

## Endpoint `/csp-report`

L’**api-gateway** expose `POST /csp-report` (route publique sans authent) qui logge en JSON les violations CSP envoyées par le navigateur en mode `Content-Security-Policy-Report-Only`. Les logs apparaissent en console (`make logs`), filtrables sur `csp-report`.

## Bascule en vraie pré-prod publique

- Remplacer `tls internal` par `tls ops@cloudity.example.com` dans le Caddyfile (ACME Let’s Encrypt).
- Remplacer les hostnames `*.cloudity.local` par les vrais domaines (DNS A/AAAA).
- Ouvrir 80/tcp + 443/tcp + **443/udp** (HTTP/3) sur le firewall.
- Une fois propre : retirer le commentaire de la **CSP enforce** et activer **HSTS preload**.

## Vérification post-quantique (édition optionnelle)

Une fois la build de Caddy à jour (≥ 2.8 avec Go 1.23+/1.24+), on peut **vérifier** que le groupe hybride est bien proposé :

```bash
openssl s_client -connect app.cloudity.example.com:443 -groups X25519MLKEM768 -tls1_3 < /dev/null
```

Voir **[../../docs/securite/REVERSE-PROXY.md](../../docs/securite/REVERSE-PROXY.md)** § 8 pour la checklist complète (testssl.sh, Mozilla Observatory, hstspreload).
