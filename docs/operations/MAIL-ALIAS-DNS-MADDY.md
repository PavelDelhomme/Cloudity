# DNS + Maddy (domaine alias) — checklist

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
3. Test local : **[MAIL-MTA-LOCAL-TEST.md](./MAIL-MTA-LOCAL-TEST.md)**
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

- **PORTAINER-MAIL-ALIAS.md** · **MAIL-ALIAS-MTA-DEPLOY.md**
- **deploy/mail-mta/README.md**
- **MAIL-ALIAS-REDIRECTION-SAFE.md** (secours redirection)
