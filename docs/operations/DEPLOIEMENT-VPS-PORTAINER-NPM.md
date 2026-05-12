# Déploiement production — VPS (ex. Contabo) + Portainer + Nginx Proxy Manager

**Rôle** : décrire **comment** Cloudity sera mis en ligne **plus tard** sur ton VPS, avec **Portainer** pour les stacks Docker et **Nginx Proxy Manager (NPM)** comme entrée HTTPS publique — **sans** confondre avec le **dev local** (`docker-compose`, ports `6080` / `6001` sur ta machine).

> Le développement quotidien reste **local uniquement** : pas besoin de NPM ni de Portainer sur ton PC pour coder. La prod est une **cible** documentée ici ; le calendrier est contraint par **[../architecture/HOMELAB-SECURITE.md](../architecture/HOMELAB-SECURITE.md)** et la décision **Q15=A** (homelab H1 avant mise en prod publique).

---

## 1. Chaîne cible (schéma mental)

```
Internet
   │ HTTPS (certificats Let’s Encrypt gérés par NPM)
   ▼
┌─────────────────────────────────────┐
│  Nginx Proxy Manager (conteneur)     │  ← hostnames : api.*, app.*, admin.*
└──────────────┬──────────────────────┘
               │ HTTP interne (réseau Docker)
               ▼
┌─────────────────────────────────────┐
│  Stacks Portainer                    │  ← compose : identity, mail, web, …
│  • api-gateway :8000                 │
│  • cloudity-web :3000 (ou image nginx)│
│  • postgres, redis, services…        │
└─────────────────────────────────────┘
```

- **Portainer** : import / édition des **stacks** (fichiers Compose), variables d’environnement, logs, redémarrage ciblé.
- **NPM** : **un Proxy Host par hostname** ; termine le TLS ; transmet vers l’IP / nom du service sur le **réseau Docker interne** (pas les ports publiés sur l’hôte sauf si tu exposes volontairement).

Référence d’architecture produit / stacks : **[../architecture/MULTI-REPO-LAYOUT.md](../architecture/MULTI-REPO-LAYOUT.md)** § 8.

---

## 2. Ports et noms (dev vs prod)

| Contexte | API (gateway) | Web (SPA) |
|----------|---------------|-----------|
| **Dev local** (`docker-compose.yml`) | Hôte `localhost:6080` → conteneur **:8000** | Hôte `localhost:6001` → conteneur **:3000** |
| **Prod (NPM → conteneurs)** | Cible **`http://api-gateway:8000`** (nom du **service** dans le Compose Portainer) | Cible **`http://cloudity-web:3000`** (ou le nom réel du service + port du **build prod** — voir § 5) |

Les ports **6080** et **6001** ne sont qu’un **mapping hôte → conteneur** pour le dev ; sur le VPS, NPM parle aux services **par leur nom DNS Docker** (souvent le **nom du service** dans le Compose, ex. `api-gateway`, `cloudity-web`) et leur **port d’écoute interne** (souvent **8000** et **3000**).

---

## 3. NPM — création d’un Proxy Host (rappel)

Pour chaque domaine (ex. `api.cloudity.example.com`) :

1. **Domain Names** : `api.cloudity.example.com`
2. **Scheme** : `http` (vers le backend interne ; le HTTPS est côté client ↔ NPM)
3. **Forward Hostname / IP** : nom du **service** Docker Compose (`api-gateway`, `cloudity-web`) — pas `localhost`
4. **Forward Port** : `8000` (gateway) ou `3000` (web dev-like) selon l’image
5. **SSL** : demander un certificat Let’s Encrypt ; activer **Force SSL** ; **HSTS** si proposé
6. **Websockets** : activer si l’UI ou les syncs en ont besoin (Vite en dev oui ; build statique selon cas)

Règles détaillées des hostnames : **MULTI-REPO-LAYOUT.md** § 8.2. Durcissement TLS / CSP / HTTP/3 / post-quantique : **[../securite/REVERSE-PROXY.md](../securite/REVERSE-PROXY.md)** (NPM repose sur nginx ; les options avancées dépendent de la **version** de l’image NPM / OpenSSL derrière — à vérifier au moment du déploiement).

---

## 4. Réseau Docker

Pour que NPM résolve `api-gateway` et `cloudity-web`, il faut que **NPM et les stacks Cloudity partagent le même réseau Docker** (réseau **external** déclaré dans plusieurs stacks, ou une stack « edge » qui inclut NPM + un reverse interne). Sinon NPM ne peut joindre que `host.docker.internal` ou l’IP du bridge — fragile.

À figer au moment du premier déploiement réel (copier-coller du nom de réseau dans toutes les stacks concernées).

---

## 5. Variables front (build prod)

En dev, `VITE_API_URL` pointe vers `http://localhost:6080`. En prod, le build du frontend doit pointer vers l’**URL publique** de l’API, par ex. `https://api.cloudity.example.com` (sans passer par un port exotique : le **443** est géré par NPM).

Documenter la valeur exacte dans Portainer (variables de stack / build args) lors du premier déploiement.

---

## 6. Ordre avec le homelab (Q15)

Tant que la **phase H1** (RPi backup + accès distant minimal) n’est pas validée, la décision enregistrée est de **ne pas** traiter le VPS Contabo comme « prod Cloudity publique » prioritaire. Ce document sert surtout à **ne rien oublier** quand le moment viendra : tu réutiliseras Portainer + NPM comme tu le fais déjà pour d’autres services.

---

## 7. Liens utiles

| Sujet | Document |
|-------|----------|
| Découpage stacks, NPM, images GHCR | **[MULTI-REPO-LAYOUT.md](../architecture/MULTI-REPO-LAYOUT.md)** § 8 |
| TLS 1.3, HSTS, CSP, HTTP/3, PQ | **[REVERSE-PROXY.md](../securite/REVERSE-PROXY.md)** |
| Homelab bloquant prod | **[HOMELAB-SECURITE.md](../architecture/HOMELAB-SECURITE.md)** |
| Décisions Q7 / Q15 / Q18–Q19 | **[decisions/multi-repo/REPONSES.md](../decisions/multi-repo/REPONSES.md)** |

---

*Fiche créée pour ancrer le déploiement **VPS + Portainer + NPM** (ex. Contabo) sans mélanger avec le workflow dev local.*
