# DNS + Maddy (domaine alias) — checklist

**Ne jamais committer** : IP VPS, FQDN réels. Les exemples utilisent `<domaine-alias>` et `<IP-VPS>`.

## MX : erreur fréquente

| Faux | Correct |
|------|---------|
| Sous-domaine `mail.<domaine>` avec MX dessus | MX sur la **racine** `@` (ou champ vide OVH) |
| `mail.<domaine> MX 10 mail.<domaine>` | `@ MX 10 mail.<domaine>.` (point final selon UI) |

Le courrier pour `user@<domaine-alias>` utilise le MX de **la racine** du domaine, pas celui du sous-domaine `mail`.

## Enregistrements minimaux (phase Maddy)

| Type | Nom | Valeur |
|------|-----|--------|
| A | `mail` | `<IP-VPS>` |
| MX | `@` | `10 mail.<domaine-alias>.` |

Tant que Maddy n’est pas validé : **garder** une redirection OVH ou ne pas supprimer les MX OVH par défaut (voir **MAIL-ALIAS-REDIRECTION-SAFE.md**).

## Zone « pas encore propre »

Tant que tu restes chez OVH Mail en parallèle, la zone peut encore contenir :

- SPF `include:mx.ovh.com`
- DKIM `ovhmo-selector-*`
- `imap` / `smtp` / `pop3` → `ssl0.ovh.net`
- `autoconfig` / `autodiscover` OVH

À **remplacer ou supprimer** seulement au moment de la bascule réelle (pas avant les tests).

## Cloudflare : est-ce nécessaire ?

**Non** pour faire tourner Maddy sur ton VPS avec DNS chez OVH.

| Besoin | Solution |
|--------|----------|
| Recevoir sur alias **sans** MTA | OVH redirection, ou **Cloudflare Email Routing** (produit séparé, pas Maddy) |
| MTA self-hosted (Maddy) | DNS chez OVH (ou CF en **DNS only**, pas proxy orange sur `mail`) |
| CDN / HTTPS web Cloudity | Cloudflare devant le **site**, pas le port 25 |

Attention : en proxy Cloudflare (nuage orange), le **SMTP entrant (25)** ne passe pas comme pour le web. Pour le mail, enregistrement `mail` en **DNS only** (gris).

## Ordre d’exécution (ne pas tout faire d’un coup)

1. Corriger MX `@` → `mail.<domaine-alias>.`
2. Déployer stack **deploy/mail-mta/docker-compose.maddy.yml** sur Portainer
3. Certificats dans `/data/tls/fullchain.pem` et `privkey.pem`
4. Ouvrir pare-feu : 25, 587, 993 (et 143/465 si besoin)
5. Test `swaks` ou mail externe vers `test@<domaine-alias>`
6. Brancher Cloudity (résolution alias) — phase suivante
7. Nettoyer SPF/DKIM/DMARC OVH → enregistrements Maddy

## Liens

- **PORTAINER-MAIL-ALIAS.md** · **MAIL-ALIAS-MTA-DEPLOY.md**
- **deploy/mail-mta/README.md**
