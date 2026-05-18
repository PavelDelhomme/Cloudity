# Portainer + NPM — déploiement sur ton VPS

**Rôle** : adapter **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** à **ton** VPS (Portainer CE + NPM déjà en place).

> **Ne jamais committer** : IP publique, mots de passe, FQDN personnels. Utilise les **placeholders** ci-dessous et Portainer → **Environment variables**.

**Suivi** : **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)**.

---

## 0. Variables Portainer (dont l’IP)

| Variable | Exemple placeholder | Où |
|----------|---------------------|-----|
| `POSTGRES_PASSWORD`, `JWT_SECRET`, … | générés | `make secrets-print` (PC local) |
| `VPS_PUBLIC_IP` | `<VPS_PUBLIC_IP>` | DNS chez ton registrar (A) — **Portainer uniquement** |
| `CORS_ORIGINS` | `https://cloudity.<domaine-principal>` | stack web |
| `VITE_API_URL` | `https://api.cloudity.<domaine-principal>` | stack web |

---

## 1. Schéma (générique)

| Élément | Détail |
|---------|--------|
| **IP VPS** | `<VPS_PUBLIC_IP>` |
| **Portainer** | CE, port `9000` (idéalement derrière NPM + auth) |
| **NPM** | réseau `nginx-proxy-manager_npm-network` (nom à vérifier dans Portainer) |
| **DNS Cloudity** (exemples) | `cloudity.<domaine-principal>`, `api.cloudity.<domaine-principal>` |
| **Sous-domaine alias mail** (ex.) | `alias.<domaine-principal>` — MX selon ton choix (Proton, OVH, futur MTA Cloudity) |

---

## 2. DNS — front + API

| FQDN | Type | Cible | NPM → conteneur |
|------|------|-------|-----------------|
| `cloudity.<domaine-principal>` | A | `<VPS_PUBLIC_IP>` | `cloudity-web:3000` |
| `api.cloudity.<domaine-principal>` | A | `<VPS_PUBLIC_IP>` | `cloudity-api-gateway:8000` |
| `admin.cloudity.<domaine-principal>` (opt.) | A | idem | `cloudity-web:3000` (`/4dm1n`) |

Les sous-domaines `mail.cloudity.*`, `office.cloudity.*` peuvent être des alias NPM vers la même SPA (`/app/mail`, …) ou supprimés si tu n’utilises que `cloudity.<domaine>/app/*`.

---

## 3. Réseaux Docker

- **`cloudity-data`** (external) : Postgres, Redis, services métier.  
- **`nginx-proxy-manager_npm-network`** (external) : NPM + `cloudity-web` + `cloudity-api-gateway` **uniquement**.

Détail : **[DEPLOIEMENT-VPS-PORTAINER-NPM.md](DEPLOIEMENT-VPS-PORTAINER-NPM.md)** § 3–4.

---

## 4. Stacks et NPM

1. Stacks `cloudity-*` selon **[DEPLOIEMENT-SUIVI.md](DEPLOIEMENT-SUIVI.md)** § 4.  
2. NPM Proxy Hosts :
   - `cloudity.<domaine-principal>` → `http://cloudity-web:3000`
   - `api.cloudity.<domaine-principal>` → `http://cloudity-api-gateway:8000`
   - SSL Let's Encrypt

---

## 5. Mise à jour d’un seul service

Tag image dans Portainer → **Update stack** — équivalent `make deploy-web`, etc.

---

## 6. Sécurité (rappel)

| Sujet | Action |
|-------|--------|
| Portainer | Derrière NPM/VPN, pas exposé brut sur Internet |
| Secrets prod | Portainer, pas le `.env` dev faible du PC |
| mTLS interne | **[MTLS-INTERNE.md](../securite/MTLS-INTERNE.md)** — phase ultérieure |

---

*Dernière mise à jour : 2026-05-18.*
