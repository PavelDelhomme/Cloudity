# Mail MTA / DNS / tests (fiche ops unique)

> Produit alias / OAuth / cache : [`../produit/MAIL.md`](../produit/MAIL.md).  
> Déploiement général : [`../../DEPLOIEMENT_PROCEDURE.md`](../../DEPLOIEMENT_PROCEDURE.md).  
> Anciens `MAIL-ALIAS-DNS-MADDY`, `MAIL-ALIAS-MTA-DEPLOY`, `MAIL-MTA-LOCAL-TEST`, `MAIL-MTA-PREPROD` → stubs.

## Sommaire

- [Déploiement MTA](#déploiement-mta)
- [DNS & Maddy](#dns--maddy)
- [Tests locaux](#tests-locaux)
- [Preprod / base déployable](#preprod--base-déployable)

---

## Déploiement MTA

## Déploiement MTA alias (préprod / prod) — squelette

**Ne jamais committer** : IP VPS, FQDN réels (`maily.ovh`, domaine principal), clés DKIM, mots de passe Portainer, identifiants OVH.

Objectif : recevoir et envoyer depuis `*@<DOMAINE-ALIAS>` sans perte de courrier sur la boîte IMAP principale déjà en production.

## Phases

| Phase | Où | Risque mail | Contenu |
|-------|-----|-------------|---------|
| **0 — MVP** | Local + Cloudity UI | Aucun | Alias enregistrés, filtres `delivered_to`, envoi SMTP fournisseur |
| **1 — Redirection** | Registrar `<DOMAINE-ALIAS>` | Faible | Option A — secours / rollback |
| **2 — MTA Cloudity** | Local 2525 puis VPS | Moyen (MX) | Maddy + `POST /mail/internal/alias-resolve` |
| **3 — Auth sortante** | DNS + MTA | Bounces / spam | SPF, DKIM, DMARC alignés sur `<DOMAINE-ALIAS>` |

## Prérequis VPS (phase 2)

- Stack Portainer existante (voir **DEPLOIEMENT-VPS-PORTAINER-NPM.md** — secrets hors Git).
- Hostname MTA : `mail.<DOMAINE-PRINCIPAL>` ou dédié (placeholder).
- Ports : **25** (SMTP entrant), **587** (soumission), éventuellement **993/143** si Dovecot sur le même host (sinon IMAP reste chez OVH).
- Certificat TLS (Let’s Encrypt via NPM ou Traefik).

## Variables d’environnement (mail-directory-service)

À définir dans Portainer / `.env` local **non versionné** :

```bash
MAIL_PRIMARY_DOMAIN=<domaine-principal>
MAIL_ALIAS_SUBDOMAIN=<domaine-alias>   # ex. suffixe UI sans @
```

L’API expose `GET /mail/me/alias-config` ; la préférence navigateur reste un complément (voir **../produit/MAIL.md#1-alias-mail** C3).

## DNS checklist `<DOMAINE-ALIAS>` (phase 2–3)

- [ ] MX → hostname MTA (priorité 10)
- [ ] SPF : `v=spf1 mx a:<hostname-mta> -all` (adapter selon stack)
- [ ] DKIM : sélecteur `cloudity` (clé générée sur le MTA, **pas dans Git**)
- [ ] DMARC : `v=DMARC1; p=quarantine; rua=mailto:dmarc@<DOMAINE-ALIAS>`
- [ ] PTR / reverse DNS cohérent avec le hostname MTA (fournisseur VPS)
- [ ] Test : mail-tester.com ou envoi depuis Gmail → `test@<DOMAINE-ALIAS>`

## Stack Docker (`deploy/mail-mta/`)

Voir **`deploy/mail-mta/README.md`** — `docker compose up` après `cp .env.example .env`.

## Stack Docker (détail services)

Services typiques (noms génériques) :

1. **postfix** (ou **maddy**) — réception, relay vers script/LMTP ou boîte
2. **opendkim** — signature sortante
3. **mail-directory-service** — déjà en place ; endpoint futur : résolution alias → `deliver_target_email` / compte IMAP

Flux entrant cible :

```text
Internet → MX (DOMAINE-ALIAS) → MTA → POST /mail/internal/alias-resolve
  → relais vers deliver_target + Delivered-To → sync IMAP Cloudity
```

API interne (token `MTA_INTERNAL_TOKEN`, hors JWT utilisateur) :

```http
POST /mail/internal/alias-resolve
X-MTA-Internal-Token: <secret>
{"alias_email":"inscriptions@<DOMAINE-ALIAS>"}
```

Test local : **[MAIL-MTA.md](MAIL-MTA.md#tests-locaux)**.

## Migration sans perte

1. **Baisser le TTL** MX du domaine alias 24–48 h avant bascule.
2. Garder la **redirection registrar** (phase 1) active jusqu’à validation MTA.
3. Déployer MTA en **écoute seule** + test interne (`swaks`, `nc`).
4. Basculer MX ; surveiller file d’attente Postfix (`mailq`).
5. Ne supprimer la redirection OVH qu’après **C7** validé (checklist produit).

## Commandes ops Cloudity

```bash
make deploy-mail    # backend mail-directory-service uniquement
## Front dev : rechargement Vite (F5)
```

## Liens

- **docs/MAIL.md#1-alias-mail** — options A/B
- **docs/MAIL.md#1-alias-mail** — tests manuels C1–C7
- **BACKLOG** — `MAIL-ALIAS-05`, `MAIL-ALIAS-06`, `AS-1`

---

## DNS & Maddy

## DNS + Maddy (domaine alias) — checklist

**Ne jamais committer** : IP VPS, FQDN réels. Les exemples utilisent `<domaine-alias>`, `<hostname-mta>`, `<IP-VPS>`.

## MX : erreur fréquente

| Faux | Correct |
|------|---------|
| Sous-domaine `mail.<domaine>` avec MX dessus | MX sur la **racine** `@` (ou champ vide OVH) |
| `mail.<domaine> MX 10 mail.<domaine>` | `@ MX 10 mail.<domaine-alias>.` (point final selon UI) |

Le courrier pour `user@<domaine-alias>` utilise le MX de **la racine** du domaine, pas celui du sous-domaine `mail`.

## Enregistrements cible (MTA Cloudity)

| Type | Nom | Valeur |
|------|-----|--------|
| A | `mail` | `<IP-VPS>` |
| MX | `@` | `10 mail.<domaine-alias>.` |
| TXT | `@` | SPF Cloudity : `v=spf1 mx a:mail.<domaine-alias> -all` (à affiner) |
| TXT | `cloudity._domainkey` | clé publique DKIM (générée sur le MTA, **hors Git**) |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@<domaine-alias>` puis durcir |

PTR / reverse DNS : cohérent avec `mail.<domaine-alias>` (fournisseur VPS).

## Migration depuis une zone OVH « mail par défaut »

Si le domaine alias n’a **pas** de MX Plan OVH actif mais affiche encore des entrées OVH :

| Entrée héritée | Action lors de la bascule MTA |
|----------------|-------------------------------|
| SPF `include:mx.ovh.com` | **Remplacer** par SPF du MTA Cloudity |
| DKIM `ovhmo-selector-*` | Supprimer ou laisser jusqu’à DKIM Cloudity prêt |
| `imap` / `smtp` / `pop3` → `ssl0.ovh.net` | Supprimer si IMAP reste sur le domaine principal |
| `A` racine → parking OVH | Optionnel ; le MX suffit pour la réception mail |
| `@ MX 10 mail.<domaine>.` + `mail A <IP>` | **Garder la forme** ; pointer `mail A` vers **ton** VPS |

**Ne pas** activer catch-all. Chaque alias = une ligne dans Cloudity + résolution API.

## Ordre d’exécution

1. Baisser TTL MX 24–48 h
2. `MTA_INTERNAL_TOKEN` + `make deploy-mail`
3. Test local : **[MAIL-MTA.md](MAIL-MTA.md#tests-locaux)**
4. Déployer `deploy/mail-mta` sur VPS (Portainer)
5. Ouvrir pare-feu 25, 587
6. Vérifier MX + test mail externe
7. SPF / DKIM / DMARC Cloudity (**MAIL-ALIAS-06**)
8. Checklist produit **C7**

## Rollback (30 s)

1. Remettre MX précédent ou couper le MX
2. Arrêter stack `cloudity-mail-mta`
3. Les alias Cloudity restent ; plus de réception Internet sur le domaine alias

## Cloudflare

**Non requis** si DNS reste chez OVH. Si Cloudflare : enregistrement `mail` en **DNS only** (gris) — le proxy orange ne gère pas SMTP entrant.

## Liens

- **PORTAINER-MAIL.md** · **MAIL-MTA.md**
- **deploy/mail-mta/README.md**
- **MAIL.md** (secours redirection)

---

## Tests locaux

## Test MTA alias en local

**Ne jamais committer** de FQDN/IP réels. Utiliser `<domaine-alias>` et `alias.example.invalid` en dev.

## Prérequis

1. Stack Cloudity : `make up` ou au minimum postgres + `make deploy-mail`
2. `MTA_INTERNAL_TOKEN` **décommenté** et identique dans `.env` racine et `deploy/mail-mta/.env`
3. Alias enregistré dans l’UI (Pass ou Mail) pour `test@<domaine-alias>` avec cible = boîte IMAP sync

## 0. `.env` local Cloudity

Dans le `.env` racine, les lignes doivent être **actives** (pas préfixées par `#`) :

```bash
MAIL_ALIAS_DOMAIN=<domaine-alias>
MAIL_ALIAS_PORT=2526
MTA_INTERNAL_TOKEN=<openssl rand -hex 32>
```

En dev, `mail-directory-service` accepte `MAIL_ALIAS_DOMAIN` comme suffixe direct si `MAIL_ALIAS_SUBDOMAIN` est vide.  
En Portainer/prod, préférer le nom canonique `MAIL_ALIAS_SUBDOMAIN=<domaine-alias>` côté service Cloudity, et `MAIL_ALIAS_DOMAIN=<domaine-alias>` côté stack `deploy/mail-mta`.

Après modification :

```bash
make deploy-mail
make sync-mail-mta-env
make test-mail-mta-local
```

Optionnel : alias réel déjà créé dans l’UI :

```bash
ALIAS_TEST_EMAIL=inscriptions@<domaine-alias> make test-mail-mta-local
```

## 1. Test API (sans port 25)

```bash
export MTA_INTERNAL_TOKEN="$(grep MTA_INTERNAL_TOKEN .env | cut -d= -f2)"
curl -sS -X POST "http://localhost:${PORT_MAIL_DIRECTORY:-6050}/mail/internal/alias-resolve" \
  -H "Content-Type: application/json" \
  -H "X-MTA-Internal-Token: ${MTA_INTERNAL_TOKEN}" \
  -d '{"alias_email":"inscriptions@<domaine-alias>"}'
```

Réponse attendue : `{"ok":true,"deliver_to":"…","account_id":…}`.

## 2. Stack Maddy locale (port 2526 par défaut si 2525 = MailHog)

```bash
make sync-mail-mta-env
make mail-mta-local-up
```

Équivalent manuel :

```bash
cd deploy/mail-mta
cp .env.local.example .env
## ou : make sync-mail-mta-env
docker compose -f docker-compose.local.yml up -d --build alias-router maddy
```

Envoi test :

```bash
swaks --to inscriptions@<domaine-alias> \
  --from sender@external.example \
  --server localhost --port 2526
```

Le flux réel est : Maddy → `alias-router` → `/mail/internal/alias-resolve` → `RELAY_SMTP_HOST:RELAY_SMTP_PORT`.  
En local, `RELAY_SMTP_PORT=1025` vise MailHog/SMTP dev par défaut ; en prod, renseigner le relais SMTP autorisé dans Portainer.

Puis **Mail → Actualiser (IMAP)** et filtre alias dans la barre latérale si le relais final livre bien dans la boîte cible.

## 3. Filtre `delivered_to`

Le MTA ajoute `Delivered-To` / `X-Original-To`. Cloudity filtre aussi `raw_headers` en base — utile quand la boîte cible affiche `To:` = adresse principale.

## 4. Avant bascule DNS prod

- [ ] Test API OK
- [ ] Test local 2526 OK (ou preprod VPS)
- [ ] MX `@` → `mail.<domaine-alias>.` (TTL baissé 24–48 h)
- [ ] SPF/DKIM/DMARC Cloudity (pas OVH `include:mx.ovh.com`)
- [ ] Rollback documenté : **[MAIL.md](../produit/MAIL.md#1-alias-mail)**

## Liens

- **[MAIL-MTA.md](MAIL-MTA.md#dns--maddy)**
- **[deploy/mail-mta/README.md](../../deploy/mail-mta/README.md)**

---

## Preprod / base déployable

## MTA alias — base déployable (preprod / prod)

**Ne jamais committer** : FQDN réels (`maily.ovh`, etc.), IP VPS, clés DKIM privées.

## Objectif

Recevoir et relayer le courrier pour `*@<domaine-alias>` vers les boîtes Cloudity (`user_email_aliases`) **sans couper** la réception sur la boîte principale tant que la bascule n’est pas validée.

## Ordre de déploiement (sans perte)

1. **Option A** (redirections OVH/registrar) — utilisable **maintenant** : voir **docs/MAIL.md#1-alias-mail**.
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
## Depuis la racine du dépôt — après configuration Portainer
docker compose -f infrastructure/docker/mail-mta/docker-compose.mail-mta.yml up -d
```

## Liens

- **../produit/MAIL.md#1-alias-mail** · **../produit/MAIL.md#1-alias-mail** · **DEPLOIEMENT-VPS-PORTAINER-NPM.md**
