# MTA alias — base déployable (preprod / prod)

**Ne jamais committer** : FQDN réels (`maily.ovh`, etc.), IP VPS, clés DKIM privées.

## Objectif

Recevoir et relayer le courrier pour `*@<domaine-alias>` vers les boîtes Cloudity (`user_email_aliases`) **sans couper** la réception sur la boîte principale tant que la bascule n’est pas validée.

## Ordre de déploiement (sans perte)

1. **Option A** (redirections OVH/registrar) — utilisable **maintenant** : voir **docs/produit/MAIL-ALIAS-RECEPTION.md**.
2. Préparer le VPS : ports **25** (entrant), **587** (soumission), pare-feu, reverse proxy **hors** ce doc si besoin admin.
3. Déployer le stack MTA en **preprod** sur un hostname dédié (ex. `mail-mta.<votre-domaine-technique>`).
4. Tester envoi/réception vers `test@<domaine-alias>` avec une seule boîte pilote.
5. **Seulement ensuite** : modifier les enregistrements MX du `<domaine-alias>` (remplacer MX OVH par défaut).
6. Publier SPF + DKIM + DMARC (**MAIL-ALIAS-06**).

## Stack proposé (MAIL-ALIAS-05)

Fichier compose (stub, non branché au `make up` principal) :

- `infrastructure/docker/mail-mta/docker-compose.mail-mta.yml`

Services prévus :

| Service | Rôle |
|---------|------|
| **maddy** (ou Postfix + Rspamd) | SMTP entrant, routage, DKIM signature |
| **volume secrets** | Clés DKIM, cert TLS (montés via Portainer) |

Variables (Portainer / `.env` local **non versionné**) :

| Variable | Exemple placeholder |
|----------|---------------------|
| `MTA_HOSTNAME` | `mail.example.invalid` |
| `MTA_ALIAS_DOMAINS` | `<domaine-alias>` |
| `MTA_RELAY_UPSTREAM` | SMTP de la boîte principale (si injection) |
| `CLOUDITY_MAIL_DIRECTORY_URL` | URL interne du service mail-directory |

## DNS checklist (`<domaine-alias>`)

- [ ] MX → hostname MTA (priorité 10)
- [ ] TXT SPF : `v=spf1 mx a:<hostname-mta> -all` (à affiner selon relais)
- [ ] TXT DKIM : sélecteur `cloudity` (clé générée sur le MTA)
- [ ] TXT DMARC : `v=DMARC1; p=quarantine; rua=mailto:dmarc@<domaine-alias>`
- [ ] PTR / reverse DNS cohérent avec `MTA_HOSTNAME` (fournisseur VPS)

## Intégration Cloudity (à implémenter)

1. Webhook ou polling MTA → `POST /internal/mail/inbound` (futur).
2. Lookup `user_email_aliases` par `RCPT TO`.
3. Livraison : sync IMAP existante ou injection LMTP (phase 2).

## Commandes (quand le compose sera activé)

```bash
# Depuis la racine du dépôt — après configuration Portainer
docker compose -f infrastructure/docker/mail-mta/docker-compose.mail-mta.yml up -d
```

## Liens

- **MAIL-ALIAS-RECEPTION.md** · **MAIL-ALIAS-VISION.md** · **DEPLOIEMENT-VPS-PORTAINER-NPM.md**
