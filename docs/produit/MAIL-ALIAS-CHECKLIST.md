# Checklist — Mail + alias (test manuel)

**Rôle** : valider **création d’alias dans l’UI** (Pass ou Mail), filtre, règle auto, envoi — avant J8 Pass / PR `dev`.

**Convention** : remplace les placeholders par **tes** valeurs (ne jamais les committer dans Git).

| Placeholder | Signification |
|-------------|----------------|
| `<domaine-principal>` | Domaine de ta boîte IMAP (ex. `exemple.ovh`) |
| `<domaine-alias>` | Domaine **dédié** aux alias (ex. `maily.exemple` — **vierge**, MX séparés) — optionnel |
| `<boite-test>` | Boîte IMAP de test (ex. `test@<domaine-principal>`) |
| `<boite-principale>` | Boîte qui reçoit le courrier (ex. `user@<domaine-principal>`) |
| `inscriptions@<domaine-alias>` | Exemple si le suffixe UI = `<domaine-alias>` (sans `alias.` devant) |
| `inscriptions@alias.<domaine-principal>` | Exemple si tu gardes le suffixe dérivé `alias.<domaine-principal>` |

---

## 1. Deux comptes différents

| Quoi | Exemple (à adapter) | Rôle |
|------|---------------------|------|
| **Login Cloudity** | `admin@cloudity.local` (`make seed-admin`) ou compte `/register` | Ouvre Mail, Pass |
| **Boîte IMAP** (Mail → Paramètres) | `<boite-test>` | Courrier synchronisé |

Tu peux te connecter en **`admin@cloudity.local`** et ajouter **`<boite-test>`** comme boîte dans Mail.

---

## 2. Prérequis

- [x] `make migrate` · `make doctor` · **`make test`** vert (2026-05-20 — 304 tests front, services Go/Python OK)
- [x] **`make deploy-mail`** — `mail-directory-service` redéployé ; recharger la page web (F5) pour le front
- [ ] Mail → **Sync avec mot de passe…** pour `<boite-test>`
- [ ] **Actualiser (IMAP)** : des messages visibles
- [ ] Si « Reçu : — » : `make deploy-mail` puis **Actualiser (IMAP)** (dates depuis en-tête `Date` IMAP)

---

## 3. Créer un alias **dans l’interface** (comme Proton — enregistrement Cloudity)

> **MVP aujourd’hui** : l’app **enregistre** l’alias + crée une **règle de filtre**.  
> **Recevoir** du courrier Internet sur une **nouvelle** adresse `@alias.<domaine>` nécessite encore le routage DNS/MX (**MAIL-ALIAS-05**) ou une redirection chez ton hébergeur.  
> Tu peux quand même **créer**, **filtrer** (si le mail arrive déjà sur la boîte), et souvent **envoyer** avec **From** = alias.

### Domaine alias (une fois)

1. **Interface (recommandé)** : **Pass → Alias mail** ou **Mail → Paramètres → Domaine des alias** → suffixe :
   - soit **`<domaine-alias>`** entier (ex. domaine dédié type Proton : `inscriptions@<domaine-alias>`),
   - soit `alias.<domaine-principal>` si tu n’as pas de domaine alias séparé.
   Puis **Enregistrer** (préférence navigateur — **ne pas committer** ton vrai domaine dans Git).
2. **Serveur (optionnel)** : `.env` `MAIL_PRIMARY_DOMAIN` / `MAIL_ALIAS_SUBDOMAIN` — équipe / prod uniquement.
3. Ensuite tu ne tapes plus que le **nom** (ex. `inscriptions`) : l’aperçu doit montrer `inscriptions@<suffixe-configuré>`.

### Phase 2 — MTA Cloudity (réception auto-hébergée)

1. `MTA_INTERNAL_TOKEN` dans `.env` + `make deploy-mail`.
2. Test API : **[MAIL-MTA-LOCAL-TEST.md](../operations/MAIL-MTA-LOCAL-TEST.md)**.
3. Optionnel : `deploy/mail-mta` local port **2525**, puis VPS + MX documentés.
4. Crée l’alias dans Cloudity, envoie vers `inscriptions@<domaine-alias>`, **Actualiser (IMAP)**.

Secours : redirection fournisseur (**MAIL-ALIAS-REDIRECTION-SAFE.md**).

> **Sans hébergeur** : tu peux enregistrer l’alias dans Cloudity (filtres, From) ; **recevoir** du courrier Internet sur `@alias.*` exige encore MX/redirection (**MAIL-ALIAS-05** / panneau OVH). Tu ne perds pas ta boîte actuelle : Cloudity **s’ajoute** à l’IMAP existant.

### Option A — depuis **Pass** (recommandé, style Proton)

1. Ouvrir **http://localhost:6001/app/pass** (coffre verrouillé ou non : le panneau alias est accessible).
2. Section **Alias mail** → choisir la boîte **`<boite-test>`** → configurer le **domaine des alias** si besoin.
3. Renseigner :
   - **Nom de l’alias** : `inscriptions` (vérifie l’aperçu : `inscriptions@<domaine-alias>` ou `inscriptions@alias.<domaine-principal>`)
   - **Libellé** (optionnel) : `Newsletter test`
   - **Cible de livraison** (optionnel) : `<boite-test>` ou `<boite-principale>`
4. Cliquer **Enregistrer l’alias** → toast *« Alias enregistré (règle de tri créée si besoin) »*.

### Option B — depuis **Mail**

1. **Mail** → icône **Paramètres Mail** (engrenage).
2. Section **Alias** → même formulaire (adresse + libellé + cible).
3. **Enregistrer**.

### Pour **recevoir** un vrai mail sur l’alias (hors MVP auto)

| Méthode | Effort |
|---------|--------|
| **Redirection hébergeur** | Créer l’alias chez OVH/… → redirige vers `<boite-test>` → enregistrer la **même** adresse dans Cloudity |
| **Transfert Proton** | Si tu utilises un domaine alias chez Proton |
| **Attendre MAIL-ALIAS-05** | MX / API Cloudity sans panneau OVH |

Ensuite envoie un mail **vers** l’alias depuis une autre boîte ; après sync IMAP, il doit apparaître sous le filtre alias.

---

## 4. Checklist à cocher (15 min)

| # | Action | OK |
|---|--------|-----|
| **C1** | **Créer** un alias via **Pass** ou **Mail** (§ 3) — pas seulement enregistrer un alias préexistant | ☐ | Pass validé en manuel ; Mail (Paramètres → Alias) à rejouer sur la même boîte |
| **C2** | Toast enregistrement + règle auto | ☐ |
| **C3** | **Mail** → barre latérale (sous la boîte) : cliquer l’alias → filtre `delivered_to` | ☐ |
| **C4** | **Paramètres Mail → Filtres et règles** : règle **Alias · …** avec `recipient_pattern` = ton alias | ☐ |
| **C5** | **Désactiver** l’alias → disparaît du filtre · **Activer** → revient | ☐ |
| **C6** | **Nouveau message** → **From** : choisir l’alias dans la liste (si SMTP autorise) | ☐ |
| **C7** | Redirection fournisseur : recevoir un mail **vers** l’alias → visible après sync + filtre | ☐ |

---

## 5. Suite

1. Cocher **C1–C7** puis **`TODOS.md`** § MAINTENANT.
2. **[SPRINT-PASS-2026-05.md](SPRINT-PASS-2026-05.md)** § 3 bis (J8).
3. PR → **`dev`**.

Voir aussi : **[MAIL-ALIAS-DEMARRAGE.md](MAIL-ALIAS-DEMARRAGE.md)** · **[MAIL-ALIAS-VISION.md](MAIL-ALIAS-VISION.md)**.
