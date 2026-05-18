# Mail de test — `test@delhomme.ovh` + alias

**Rôle** : procédure **manuelle** pour valider Mail + alias avant J8 Pass / PR `dev`.  
**Compte IMAP de test** : `test@delhomme.ovh` (boîte reliée dans Cloudity, pas le login Cloudity).

---

## 1. Deux comptes différents (ne pas confondre)

| Quoi | Exemple | Rôle |
|------|---------|------|
| **Compte Cloudity** (login app) | `admin@cloudity.local` ou `testeur@delhomme.ovh` créé sur `/register` | Ouvre Mail, Pass, Drive |
| **Boîte mail IMAP** (dans Mail → Paramètres) | `test@delhomme.ovh` | Courrier synchronisé |

Tu peux rester connecté en **`admin@cloudity.local`** et ajouter **`test@delhomme.ovh`** comme **deuxième boîte** dans Mail.

### Créer un compte Cloudity dédié tests (optionnel)

1. `make up`
2. Ouvrir **http://localhost:6001/register**
3. Créer par ex. `mailtest@delhomme.ovh` + mot de passe fort (local uniquement)
4. Se connecter avec ce compte, puis ajouter la boîte IMAP `test@delhomme.ovh`

Ou plus rapide : **`make seed-admin`** → login **`admin@cloudity.local`** / mot de passe dans `Makefile` / `scripts/db/`.

---

## 2. Prérequis boîte `test@delhomme.ovh`

- [ ] `make migrate` (migration **40** alias `enabled`)
- [ ] `make doctor` · `make test` verts
- [ ] Mail → **Paramètres Mail → Sync avec mot de passe…** pour `test@delhomme.ovh`
- [ ] **Actualiser (IMAP)** ou sync auto : des messages apparaissent

### Dates « Reçu »

Si toutes les dates semblent « à l’instant » : c’était le repli sur `created_at` (heure de sync). Après mise à jour du code :

1. `make deploy-mail` (ou `make up`)
2. Mail → **Actualiser (IMAP)** sur la boîte test  
3. Les messages doivent afficher la **vraie date** (enveloppe ou **InternalDate** serveur IMAP)

---

## 3. Checklist alias (15 min) — à cocher

| # | Action | OK |
|---|--------|-----|
| A1 | **Pass** ou **Mail → Paramètres → Alias** : créer un alias déjà routé vers ta boîte (ex. une adresse Proton/OVH qui arrive sur `test@delhomme.ovh`) | ☐ |
| A2 | Toast *« Alias enregistré (règle de tri créée si besoin) »* | ☐ |
| A3 | **Mail** → barre latérale sous la boîte : cliquer l’alias → liste filtrée (`delivered_to`) | ☐ |
| A4 | **Paramètres Mail → Filtres et règles** : voir une règle **Alias · …** avec `recipient_pattern` = l’adresse alias | ☐ |
| A5 | **Désactiver** l’alias → disparaît du filtre latéral · **Activer** → revient | ☐ |
| A6 | Envoi test avec **From** = alias (si ton SMTP l’autorise) | ☐ |

**Sans MX/alias réseau** : l’étape A1 ne reçoit pas de nouveaux mails Internet ; tu peux quand même tester A2–A5 avec une adresse **déjà** connue du serveur.

Doc : **[MAIL-ALIAS-DEMARRAGE.md](MAIL-ALIAS-DEMARRAGE.md)**.

---

## 4. Ensuite (ordre)

1. Cocher la checklist ci-dessus dans **`TODOS.md`** § MAINTENANT.
2. **J8 Pass** — **[SPRINT-PASS-2026-05.md](SPRINT-PASS-2026-05.md)** § 3 bis.
3. **PR → `dev`** — CI verte.
4. Préprod — **[DEPLOIEMENT-SUIVI.md](../operations/DEPLOIEMENT-SUIVI.md)**.
