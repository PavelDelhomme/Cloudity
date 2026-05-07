# `step-ca` — PKI interne Cloudity

> **Rôle** : autorité de certification interne pour le **mTLS** entre microservices (cf. **[../docs/MTLS-INTERNE.md](../../docs/MTLS-INTERNE.md)**). Optionnelle au démarrage : on l’active via le compose **`docker-compose.security.yml`** et la cible **`make mtls-up`**. Tant que `step-ca` n’est pas lancé, les services continuent en HTTP plain (`MTLS_MODE=off`).

## Démarrage rapide

```bash
# 1) Créer le mot de passe de la CA (seul endroit où il existe en clair, hors-ligne idéalement) :
cp infrastructure/step-ca/secrets/ca-password.example infrastructure/step-ca/secrets/ca-password
echo "$(openssl rand -base64 32)" > infrastructure/step-ca/secrets/ca-password

# 2) Démarrer step-ca (image officielle Smallstep) :
make mtls-up

# 3) Initialiser la CA (la première fois seulement) :
make seed-mtls
```

`make seed-mtls` exécute `step ca init` à l’intérieur du conteneur avec :

- **Nom** : `Cloudity Internal CA`
- **DNS** : `step-ca,localhost`
- **Provisioner** : `cloudity-jwt` (provisioner JWT, pour automatiser l’émission de certs services)
- **Mot de passe** : lu depuis `secrets/ca-password`

Les fichiers générés (root, intermediate, configuration) sont stockés dans le **volume `step_ca_data`** — le mot de passe **n’est jamais** persisté à l’intérieur du conteneur.

## Émission d’un cert service

Une fois la CA prête, chaque service Go peut récupérer un cert client/serveur via :

```bash
docker compose -f docker-compose.yml -f docker-compose.security.yml exec step-ca \
  step ca certificate "auth-service" /run/step/auth-service/cert.pem /run/step/auth-service/key.pem \
  --provisioner cloudity-jwt --not-after 24h
```

En pratique, on utilisera un **sidecar** ou un **init container** par service (cf. `MTLS-INTERNE.md` § 4) qui appelle `step ca certificate` au boot puis `step ca renew` en boucle.

## Sécurité

- **Le mot de passe** dans `secrets/ca-password` est ignoré par git (`.gitignore`). **Ne pas le committer**.  
- Pour la prod, conserver la **root CA** hors-ligne (clé sur disque chiffré, sortie de la machine de prod) et n’utiliser que l’**intermediate CA** pour signer les certs services.  
- Renouveler les certs **toutes les 24 h** (dev) ou **7 j** (prod) — voir `MTLS-INTERNE.md` § 3.4.

## Liens

- **[../../docs/MTLS-INTERNE.md](../../docs/MTLS-INTERNE.md)** — plan global et patterns Go (`backend/internalsec`).  
- **[../../docs/SECURITE.md](../../docs/SECURITE.md)** § 5 (Zero Trust) et § 8 (post-quantique : passage aux certs hybrides ML-DSA + ECDSA).  
- **[../../docker-compose.security.yml](../../docker-compose.security.yml)** — service `step-ca`.
