# Réception réelle sur un domaine alias (`MAIL-ALIAS-05`)

**Ne jamais committer** : IP VPS, FQDN réels, clés API OVH. Utiliser des placeholders dans Git ; noter les valeurs dans Portainer / carnet local.

## État MVP (déjà livré)

| Étape | Outil |
|-------|--------|
| Enregistrer `nom@<domaine-alias>` | UI Pass / Mail |
| Filtre `delivered_to`, règle auto, on/off | Cloudity |
| Envoi `From` = alias | SMTP fournisseur (si autorisé) |
| **Recevoir depuis Internet** sur `@<domaine-alias>` | **Pas encore** — ce document |

## Test sans risque (redirections)

Voir **MAIL-ALIAS-REDIRECTION-SAFE.md** (domaine jetable, sous-adresse, rollback).

## Option A — Court terme (sans MTA Cloudity)

Chez le registrar du **`<domaine-alias>`** :

1. Créer une **redirection** ou alias mail : `inscriptions@<domaine-alias>` → `<boite-test>@<domaine-principal>`.
2. Dans Cloudity, enregistrer **exactement** la même adresse `inscriptions@<domaine-alias>` (suffixe UI = `<domaine-alias>`).
3. Le courrier arrive sur la boîte IMAP déjà synchronisée → **C7** possible après sync.

Avantage : pas de port 25, pas de MX custom sur le VPS. Inconvénient : gestion manuelle par alias chez l’hébergeur (ou API OVH plus tard).

## Option B — Moyen terme (`MAIL-ALIAS-05` + `AS-1`)

1. Déployer un **MTA** Cloudity (Postfix / Maddy / Haraka) sur le VPS — stack **`AS-1`** dans **BACKLOG**.
2. DNS sur **`<domaine-alias>`** (exemple générique, à adapter) :
   - MX `10 mail.<domaine-principal>.` (ou hostname MTA du VPS — **pas d’IP en dur dans Git**)
   - SPF, DKIM, DMARC pour **`<domaine-alias>`** (**MAIL-ALIAS-06**)
3. Port **25 entrant** ouvert sur le VPS (pare-feu + fournisseur cloud).
4. Backend : tout `*@<domaine-alias>` → lookup `user_email_aliases` → livraison boîte cible / injection IMAP.

Voir **DEPLOIEMENT-VPS-PORTAINER-NPM.md** (secrets Portainer uniquement) et le squelette ops **docs/operations/MAIL-ALIAS-MTA-DEPLOY.md** (phases, DNS, migration sans perte).

## Checklist DNS (quand tu passes en option B)

- [ ] MX OVH par défaut du domaine alias retirés ou remplacés
- [ ] MX vers le MTA Cloudity
- [ ] SPF + DKIM + DMARC
- [ ] Test envoi externe → `test@<domaine-alias>`
- [ ] C7 dans **MAIL-ALIAS-CHECKLIST.md**

## Liens

- Test manuel MVP : **MAIL-ALIAS-CHECKLIST.md**
- Vision produit : **MAIL-ALIAS-VISION.md** (si présent) · **BACKLOG** MAIL-ALIAS-05/06, AS-1
