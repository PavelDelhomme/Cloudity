# Test alias par redirection — sans casser la prod

**Ne jamais committer** de FQDN réels ni captures DNS avec IP.

## Principe

L’**option A** (redirection registrar) ne touche **pas** aux MX du domaine principal ni à la boîte IMAP existante. Tu ajoutes seulement une règle « `alias@…` → boîte principale ».

## Stratégies (du plus sûr au plus engageant)

| Stratégie | Risque | Revert |
|-----------|--------|--------|
| **A1 — Sous-adresse sur le domaine principal** | Très faible | Supprimer la redirection |
| **A2 — Domaine jetable / test** (ex. domaine à 1 €) | Nul pour la prod | Laisser expirer ou supprimer le domaine |
| **A3 — Domaine alias prod** (`<domaine-alias>`) | Moyen si MX modifiés par erreur | Ne **pas** changer les MX ; uniquement redirection « alias mail » OVH |

Pour valider Cloudity **avant** maily.ovh en prod : préférer **A1** ou **A2**.

### A1 — Exemple (placeholders)

1. Chez OVH : redirection `test-alias@<domaine-principal>` → `mailtest@<domaine-principal>`.
2. Cloudity : enregistrer `test-alias@<domaine-principal>` (suffixe UI = domaine principal).
3. Envoyer un mail externe vers `test-alias@…` → sync IMAP → filtre `delivered_to` (**C7** checklist).

Aucun MX du domaine alias n’est impliqué.

### A2 — Domaine de test dédié

1. Acheter / utiliser un domaine « poubelle ».
2. Redirection `probe@<domaine-test>` → ta boîte pilote.
3. Suffixe alias UI = `<domaine-test>`.
4. Quand OK : reproduire la même mécanique sur `<domaine-alias>` prod (**une** redirection à la fois).

### A3 — Domaine alias prod (maily.ovh, etc.)

**À faire uniquement si tu n’as pas encore touché aux MX.**

1. OVH → domaine alias → **Redirections / alias mail** (pas « Zone DNS MX »).
2. `inscriptions@<domaine-alias>` → `mailtest@<domaine-principal>`.
3. Cloudity : même adresse `inscriptions@<domaine-alias>`.
4. Sync IMAP boîte `mailtest@…`.

**Ne pas** remplacer les MX OVH tant que le MTA Cloudity n’est pas validé (voir **MAIL-ALIAS-RECEPTION.md** option B).

## Rollback (30 secondes)

1. Supprimer la redirection chez le registrar.
2. Désactiver ou supprimer l’alias dans Cloudity (règles de tri supprimées automatiquement).
3. Les messages déjà en boîte restent ; plus de nouveaux sur cet alias.

## Checklist avant bascule MX (phase MTA)

- [ ] Test A1 ou A2 OK (**MAIL-ALIAS-CHECKLIST.md** C7)
- [ ] Stack `deploy/mail-mta` en preprod sur VPS (**PORTAINER-MAIL-ALIAS.md**)
- [ ] TTL MX baissé 24–48 h
- [ ] Redirection registrar **laissée active** jusqu’à preuve MTA
- [ ] Plan rollback : remettre MX OVH + couper le stack Portainer

## Liens

- **MAIL-ALIAS-RECEPTION.md** · **MAIL-ALIAS-CHECKLIST.md**
- **docs/operations/PORTAINER-MAIL-ALIAS.md**
