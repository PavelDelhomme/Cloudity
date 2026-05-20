# Déploiement MTA alias (préprod / prod) — squelette

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

L’API expose `GET /mail/me/alias-config` ; la préférence navigateur reste un complément (voir **MAIL-ALIAS-CHECKLIST.md** C3).

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

Test local : **[MAIL-MTA-LOCAL-TEST.md](./MAIL-MTA-LOCAL-TEST.md)**.

## Migration sans perte

1. **Baisser le TTL** MX du domaine alias 24–48 h avant bascule.
2. Garder la **redirection registrar** (phase 1) active jusqu’à validation MTA.
3. Déployer MTA en **écoute seule** + test interne (`swaks`, `nc`).
4. Basculer MX ; surveiller file d’attente Postfix (`mailq`).
5. Ne supprimer la redirection OVH qu’après **C7** validé (checklist produit).

## Commandes ops Cloudity

```bash
make deploy-mail    # backend mail-directory-service uniquement
# Front dev : rechargement Vite (F5)
```

## Liens

- **docs/produit/MAIL-ALIAS-RECEPTION.md** — options A/B
- **docs/produit/MAIL-ALIAS-CHECKLIST.md** — tests manuels C1–C7
- **BACKLOG** — `MAIL-ALIAS-05`, `MAIL-ALIAS-06`, `AS-1`
