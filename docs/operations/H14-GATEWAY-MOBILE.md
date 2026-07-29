# H14 — Gateway mobile (LAN → HTTPS préprod/prod)

**Pilotage** : tâche `H14` · cycle *À faire maintenant*.  
**But** : le téléphone (Mail/Drive/Photos/Pass) se connecte à la bonne URL gateway, avec CORS OK.

Ce n’est **pas** une seule manip. Il y a **3 contextes** distincts :

| Contexte | Où | URL typique | Quand |
|----------|-----|-------------|--------|
| **A — Local PC** | ton Arch, `make up` | `http://localhost:6002` | Dev web uniquement |
| **B — LAN téléphone** | même PC + Wi‑Fi | `http://192.168.x.x:6002` | Tester apps Flutter chez toi |
| **C — VPS préprod/prod** | Portainer + NPM | `https://api.cloudity.<domaine>` | Vraie mise en ligne |

Tu coches les critères H14 **dans l’ordre A → B → C**.  
Si C plante → **Signaler un problème** sur H14 (ne marque pas OK trop tôt).

---

## Critère 1 — `make sync-public-urls` (PC local)

### Quoi
Une seule source de vérité dans `.env` :

```bash
CLOUDITY_PUBLIC_HOST=…      # localhost | IP LAN | domaine
CLOUDITY_PUBLIC_PROTO=http  # ou https en préprod/prod
# optionnel :
CLOUDITY_PUBLIC_API_HOST=api.cloudity.example
CLOUDITY_PUBLIC_OMIT_PORTS=true   # derrière NPM (pas de :6002)
```

La commande **réécrit** dans `.env` :

- `VITE_API_URL`
- `CLOUDITY_MOBILE_GATEWAY_URL`
- `CORS_ORIGINS` (+ extras)
- WebAuthn / OAuth liés

### Où
**Sur ton PC**, dans le dépôt Cloudity (pas dans Portainer) :

```bash
cd ~/…/Cloudity
# Ex. LAN :
#   CLOUDITY_PUBLIC_HOST=192.168.1.134
#   CLOUDITY_PUBLIC_PROTO=http
make sync-public-urls
# Vérifier :
grep -E '^(VITE_API_URL|CLOUDITY_MOBILE_GATEWAY_URL|CORS_ORIGINS)=' .env
```

### Attendu (LAN)
```text
VITE_API_URL=http://192.168.1.134:6002
CLOUDITY_MOBILE_GATEWAY_URL=http://192.168.1.134:6002
CORS_ORIGINS=…http://192.168.1.134:6001…
```

Puis redémarre le front si besoin : `make deploy-web` (ou rebuild web).

### Attendu (préprod/prod — encore sur PC pour générer le fichier)
```bash
CLOUDITY_PUBLIC_HOST=cloudity.delhomme.ovh   # ex.
CLOUDITY_PUBLIC_PROTO=https
CLOUDITY_PUBLIC_API_HOST=api.cloudity.delhomme.ovh
CLOUDITY_PUBLIC_OMIT_PORTS=true
make env-prod DOMAIN=delhomme.ovh   # ou sync-public-urls puis make env-prod
```
→ produit `.env.prod` / sortie `make portainer-env` à coller dans Portainer.

**Valide critère 1** si les variables collent au contexte (LAN ou HTTPS) que tu testes.

---

## Critère 2 — App mobile pointe vers la bonne URL

### Quoi
`scripts/mobile/run-mobile.sh` lit `CLOUDITY_MOBILE_GATEWAY_URL` et passe :

`--dart-define=CLOUDITY_GATEWAY_URL=…`

### Où
PC + téléphone USB/Wi‑Fi :

```bash
# .env déjà sync (critère 1)
make run-mobile APP=Mail     # ou Drive / Photos / Pass
```

Dans l’écran login mobile, l’URL gateway préremplie doit être **exactement** celle du `.env`.

### Attendu
- Login possible (même si 2FA ensuite).
- Pas d’erreur « connection refused » vers `localhost` depuis le téléphone (le téléphone n’est pas ton PC).

**Valide critère 2** si au moins une app ouvre le login contre cette URL.

---

## Critère 3 — Smoke login + CORS

### 3b — HTTPS VPS — via ZoneForge (cible) / manuel interim

Si TLS / CORS / NPM te saoule : **avance [ZoneForge](https://github.com/PavelDelhomme/ZoneForge)** (`ZF-01`→`ZF-03` dans Pilotage) plutôt que coller tout dans Portainer/NPM.
Checklist manuelle ci-dessous = **interim** seulement — voir aussi [ZONEFORGE-CLOUDITY.md](ZONEFORGE-CLOUDITY.md).

Symptôme typique : login mobile ou web OK en LAN, **KO** derrière NPM (`CORS` / certificat / mixed content).

| Étape | Action | Attendu |
|-------|--------|---------|
| 1 | DNS `A` `cloudity.<dom>` + `api.cloudity.<dom>` → IP VPS | Propagation OK |
| 2 | Portainer Env : `CORS_ORIGINS=https://cloudity.<dom>` (sans `/` final), `CORS_ALLOW_LAN=false`, `VITE_API_URL=https://api.cloudity.<dom>`, `CLOUDITY_MOBILE_GATEWAY_URL=https://api.cloudity.<dom>` | `make env-prod` / `portainer-env` |
| 3 | NPM Proxy Host API : `api.cloudity.<dom>` → `http://cloudity-api-gateway:8000`, **Force SSL**, même réseau que Nextcloud | Cert LE émis |
| 4 | NPM Proxy Host Web : `cloudity.<dom>` → `http://cloudity-web:3000`, Force SSL | Idem |
| 5 | Redeploy stack après Env | Conteneurs up |
| 6 | `curl -sS https://api.cloudity.<dom>/health` | `healthy` |
| 7 | OPTIONS depuis Origin `https://cloudity.<dom>` | `Access-Control-Allow-Origin: https://cloudity.<dom>` |
| 8 | App mobile rebuild avec gateway HTTPS | Login OK |

Si CORS KO : l’Origin exacte du navigateur **doit** être dans `CORS_ORIGINS` (pas de wildcard magique).  
Si TLS KO : vérifier Force SSL + certificat sur **les deux** hosts, pas seulement le web.

Doc stack : [DEPLOY-PORTAINER-NPM-CLOUDITY.md](DEPLOY-PORTAINER-NPM-CLOUDITY.md).

### B — LAN (souvent déjà OK chez toi)

```bash
curl -sS http://192.168.1.134:6002/health
# → {"status":"healthy"}

curl -sS -D- -o /dev/null -X OPTIONS http://192.168.1.134:6002/auth/login \
  -H 'Origin: http://192.168.1.134:6001' \
  -H 'Access-Control-Request-Method: POST'
# → Access-Control-Allow-Origin: http://192.168.1.134:6001
```

Puis login Mail/Drive/Photos/Pass **depuis le téléphone** (même Wi‑Fi).

### C — HTTPS VPS (le vrai reste H14)

Voir **[DEPLOY-PORTAINER-NPM-CLOUDITY.md](DEPLOY-PORTAINER-NPM-CLOUDITY.md)** (comme Nextcloud) :

1. DNS `A` : `cloudity.<dom>` + `api.cloudity.<dom>` → IP VPS  
2. Stack Portainer Cloudity (compose + env depuis `make portainer-env`)  
3. NPM Proxy Host :
   - `api.cloudity.<dom>` → `http://cloudity-api-gateway:8000` (+ SSL force)
   - `cloudity.<dom>` → `http://cloudity-web:3000` (+ SSL force)
4. Sur le téléphone : gateway = `https://api.cloudity.<dom>` (rebuild app avec cette URL)
5. CORS_ORIGINS prod = `https://cloudity.<dom>` (pas de LAN)

**Valide critère 3** si login mobile OK sur le contexte visé (LAN **ou** HTTPS).  
Pour cocher **OK** global H14, il faut **C** (HTTPS) ou documenter explicitement « LAN only accepté pour l’instant » en PARTIEL.

---

## Que faire dans Pilotage ?

| Situation | Action UI |
|-----------|-----------|
| LAN OK, HTTPS pas encore | Critères 1–2–3 LAN cochés → décision **Partiel** |
| Bug CORS / TLS sur VPS | **Signaler un problème** + coller log NPM/gateway → traite le problème d’abord |
| HTTPS + login 4 apps OK | Tout coché → **OK** |
| Tu ne touches pas au VPS aujourd’hui | **Plus tard** uniquement si tu assumes de pauser H14 |

---

## Liens

- **Stack Portainer Git (complet)** : [PORTAINER-STACK-GIT-COMPLET.md](PORTAINER-STACK-GIT-COMPLET.md)  
- Versions libs/services : [VERSIONS-PROJET.md](VERSIONS-PROJET.md) · [../architecture/VERSIONNAGE-LIBS.md](../architecture/VERSIONNAGE-LIBS.md)  
- `make sync-public-urls` · [ENV-GENERATION.md](ENV-GENERATION.md)  
- Portainer/NPM : [PORTAINER-VPS.md](PORTAINER-VPS.md) · [DEPLOY-PORTAINER-NPM-CLOUDITY.md](DEPLOY-PORTAINER-NPM-CLOUDITY.md) · [../../deploy/portainer/PORTAINER-STACK.md](../../deploy/portainer/PORTAINER-STACK.md)  
- Suivi phases : [DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)
