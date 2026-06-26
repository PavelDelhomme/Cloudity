# Connexion Gmail « comme BlueMail » — guide admin Cloudity

Pour que les utilisateurs puissent **connecter leur Gmail en un clic** (« Continuer avec Google »), sans mot de passe d’application, l’administrateur configure l’OAuth Google **une fois** dans Google Cloud Console, puis renseigne quelques variables dans Cloudity.

**Projet Google Cloud visé** : `CloudityConsole` (ou équivalent).  
**Domaine prod prévu** : `delhomme.ovh` — front `cloudity.delhomme.ovh`, API `api.cloudity.delhomme.ovh` (cf. [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md)).

---

## Les 3 phases (ne pas tout faire le même jour)

| Phase | Quand | Où | Résultat |
|-------|--------|-----|----------|
| **A — Google Cloud Console** | **Maintenant** (sans déployer Cloudity) | [console.cloud.google.com](https://console.cloud.google.com/) | Client ID + Secret + URI enregistrées |
| **B — Dev local** | Quand tu veux tester Gmail OAuth chez toi | `.env` + `docker compose` | Bouton « Continuer avec Google » actif sur `localhost:6001` |
| **C — Préprod / prod VPS** | **Plus tard** (Portainer + NPM) | Stack Portainer + DNS | Même client Google, autres URLs HTTPS |

Tu peux **terminer la phase A aujourd’hui** et reprendre Cloudity (Mail OVH, Drive, etc.) : rien ne casse tant que le `.env` n’est pas rempli.

---

## Phase A — Google Cloud Console (pas à pas)

### A.1 — Projet

1. Ouvre **https://console.cloud.google.com/**
2. Sélecteur de projet (en haut) → **CloudityConsole** (ou crée-le : *Nouveau projet* → nom `CloudityConsole` → *Créer*).

### A.2 — Activer l’API Gmail

1. Menu ☰ → **APIs et services** → **Bibliothèque**
2. Recherche **Gmail API**
3. Ouvre **Gmail API** → **Activer**

*(Optionnel mais utile pour le profil email au callback : **Google People API** — pas strictement obligatoire ; Cloudity utilise surtout Gmail API `users.getProfile`.)*

### A.3 — Écran de consentement OAuth (étape 2 de l’assistant)

Menu ☰ → **APIs et services** → **Écran de consentement OAuth** (ou l’assistant te l’ouvre avant de créer l’ID client).

#### Type d’utilisateur

| Choix | Quand |
|-------|--------|
| **Externe** | **Recommandé** — comptes Gmail perso (`@gmail.com`) et futurs utilisateurs Cloudity |
| Interne | Uniquement si tu as **Google Workspace** et que seuls les comptes de ton organisation doivent se connecter |

→ Choisis **Externe** → **Créer**.

#### Informations sur l’application (page que tu vois actuellement)

Remplis **au minimum** :

| Champ | Valeur suggérée Cloudity | Obligatoire |
|-------|-------------------------|-------------|
| **Nom de l’application** | `Cloudity` | Oui |
| **Adresse e-mail d’assistance utilisateur** | Ton email (ex. `paul@delhomme.ovh` ou ton Gmail admin) | Oui |
| **Logo de l’application** | *Laisser vide pour l’instant* — optionnel en mode **Test** ; validation Google requise si logo + app publique | Non |
| **Coordonnées du développeur — Adresses e-mail** | Même email que ci-dessus (notifications Google sur le projet) | Oui |

→ **Enregistrer et continuer**.

#### Champs des pages suivantes (assistant)

**Domaines de l’application** (si la console les demande) :

| Champ | Dev / test | Prod (plus tard) |
|-------|------------|------------------|
| **Domaine autorisé** (Application home) | *Peut rester vide en phase test* | `cloudity.delhomme.ovh` |
| **Domaines autorisés** (liste) | *Vide OK en test* | `delhomme.ovh` |

**Pages légales** (liens politique de confidentialité / CGU) :

- En mode **Test** : souvent **facultatif** pour toi seul.
- Avant **Publication en production** pour le public : il faudra des URLs réelles (ex. `https://cloudity.delhomme.ovh/legal/privacy` quand la page existera).

→ **Enregistrer et continuer** sur chaque écran jusqu’aux **Scopes**.

#### Scopes (autorisations)

Clique **Ajouter ou supprimer des scopes**, puis ajoute **exactement** :

| Scope | Usage Cloudity |
|-------|----------------|
| `https://mail.google.com/` | Lecture / sync IMAP via OAuth (XOAUTH2) |
| `openid` | Identité OpenID |
| `email` | Adresse email du compte Google |

*(La console peut aussi proposer « …/auth/gmail.readonly » — Cloudity demande **`https://mail.google.com/`** côté serveur ; aligne-toi sur ce scope complet pour sync + envoi.)*

→ **Enregistrer et continuer**.

#### Utilisateurs test (mode External + état **Test**)

Tant que l’app n’est **pas publiée**, seuls les comptes listés ici peuvent se connecter :

1. **+ ADD USERS**
2. Ajoute **chaque** Gmail que tu veux tester (ex. ton `@gmail.com` perso)
3. **Enregistrer et continuer**

→ **Retour au tableau de bord**.

**État de publication** : laisse **Testing** pour le dev ; passe en **In production** seulement quand tu ouvriras Cloudity à d’autres utilisateurs (vérification Google possible).

### A.4 — Créer l’ID client OAuth (étape 4–5 de l’assistant)

Menu ☰ → **APIs et services** → **Identifiants** → **+ Créer des identifiants** → **ID client OAuth**.

| Champ | Valeur |
|-------|--------|
| **Type d’application** | **Application Web** |
| **Nom** | `Cloudity Mail OAuth` |

**URI de redirection autorisés** — ajoute **les deux** (Google accepte plusieurs URI sur le même client) :

```
http://localhost:6002/mail/me/oauth/google/callback
https://api.cloudity.delhomme.ovh/mail/me/oauth/google/callback
```

Règles strictes :

- **Pas** de slash final
- **Pas** `cloudity.delhomme.ovh` (c’est le front, pas l’API)
- **Pas** `mail.cloudity.delhomme.ovh` (réservé MTA mail entrant, pas le callback OAuth)
- En local le port est **`6002`** = gateway (`PORT_GATEWAY`, `make status`) — pas `6001` (web)

**Origines JavaScript autorisées** (si le formulaire les demande) :

```
http://localhost:6001
https://cloudity.delhomme.ovh
```

→ **Créer**.

### A.5 — Noter les identifiants (étape « Vos identifiants »)

Une popup affiche :

- **ID client** : `….apps.googleusercontent.com`
- **Secret client** : `GOCSPX-…`

Copie-les dans un **gestionnaire de mots de passe** ou un fichier **hors Git** (`.env` local, jamais commité).

Pour les retrouver plus tard : **Identifiants** → clic sur `Cloudity Mail OAuth` → ID client / Afficher le secret.

**Phase A terminée** quand : Gmail API activée, écran de consentement rempli, utilisateurs test ajoutés, ID client Web créé avec les 2 URI ci-dessus.

---

## Phase B — Dev local (plus tard, quand tu veux tester)

### B.1 — Variables `.env`

À la racine du repo Cloudity (voir aussi `.env.example`) :

```env
GOOGLE_OAUTH_CLIENT_ID=coller-id-client.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=coller-secret-GOCSPX
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:6002/mail/me/oauth/google/callback
MAIL_OAUTH_FRONTEND_URL=http://localhost:6001
```

| Variable | Rôle |
|----------|------|
| `GOOGLE_OAUTH_REDIRECT_URI` | URL où **Google** renvoie le navigateur (gateway) |
| `MAIL_OAUTH_FRONTEND_URL` | URL où Cloudity **redirige l’utilisateur** après succès (`/app/mail?oauth=google&status=ok`) |

### B.2 — Redémarrer le service Mail

```bash
docker compose up -d mail-directory-service
# ou
make rebuild-mail
```

### B.3 — Vérifier

1. `make up` — stack locale
2. Ouvre **http://localhost:6001/app/mail**
3. **Continuer avec Google**
4. Compte Google = un **utilisateur test** de la phase A.3
5. Retour Cloudity → toast « Compte Gmail connecté » → sync IMAP

**Erreurs fréquentes**

| Message | Cause | Fix |
|---------|--------|-----|
| `redirect_uri_mismatch` | URI `.env` ≠ URI Google Console | Recopier caractère par caractère |
| `access_denied` / app bloquée | Compte pas dans **Utilisateurs test** | Ajouter l’email dans l’écran de consentement |
| Bouton Google grisé / « non activée » | Variables absentes du `.env` | Remplir `GOOGLE_OAUTH_*` + restart mail |
| 503 OAuth | Secret ou ID manquant | Vérifier les 3 variables |

---

## Phase C — Préprod / prod sur VPS (bien plus tard)

Quand Cloudity tournera sur le VPS (Portainer + Nginx Proxy Manager) :

### C.1 — DNS (OVH)

Enregistrement **A** → `95.111.227.204` (ton VPS) :

| FQDN | Rôle |
|------|------|
| `cloudity.delhomme.ovh` | Front SPA (déjà prévu) |
| `api.cloudity.delhomme.ovh` | **Gateway API** — **obligatoire** pour OAuth prod |

*(Tu peux créer `api.cloudity.delhomme.ovh` maintenant en DNS ; le proxy NPM viendra au déploiement.)*

### C.2 — Nginx Proxy Manager

| Domain Names | Forward to |
|--------------|------------|
| `cloudity.delhomme.ovh` | `http://cloudity-web:3000` |
| `api.cloudity.delhomme.ovh` | `http://cloudity-api-gateway:8000` |

Let's Encrypt activé sur les deux. Conteneurs sur le **réseau edge** partagé avec NPM.

### C.3 — Variables Portainer (stack mail / identity)

**Même** Client ID et Secret qu’en local ; seules les URLs changent :

```env
GOOGLE_OAUTH_REDIRECT_URI=https://api.cloudity.delhomme.ovh/mail/me/oauth/google/callback
MAIL_OAUTH_FRONTEND_URL=https://cloudity.delhomme.ovh
```

Le front est buildé avec `VITE_API_URL=https://api.cloudity.delhomme.ovh`.

Détail stacks : [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md).

---

## Récapitulatif des URLs Cloudity × Google

| Environnement | Callback OAuth (`GOOGLE_OAUTH_REDIRECT_URI`) | Front après login (`MAIL_OAUTH_FRONTEND_URL`) |
|---------------|-----------------------------------------------|-----------------------------------------------|
| **Local** | `http://localhost:6002/mail/me/oauth/google/callback` | `http://localhost:6001` |
| **Prod** | `https://api.cloudity.delhomme.ovh/mail/me/oauth/google/callback` | `https://cloudity.delhomme.ovh` |

Les **deux** URI de callback doivent être listées dans Google Console dès la phase A — une seule paire Client ID / Secret pour tous les environnements.

---

## Flux utilisateur (rappel)

```
Mail Cloudity → « Continuer avec Google »
  → GET /mail/me/oauth/google/authorize (gateway, avec JWT)
  → Redirection Google (consentement)
  → GET https://api…/mail/me/oauth/google/callback?code=…&state=…
  → Cloudity crée/met à jour la boîte + refresh token chiffré
  → Redirection https://cloudity…/app/mail?oauth=google&status=ok
```

Aucun mot de passe d’application Gmail.

---

## Alternative : mot de passe d’application (sans OAuth)

Si OAuth n’est pas configuré, les utilisateurs peuvent encore ajouter Gmail via **Autre compte (IMAP…)** avec un [mot de passe d’application Google](https://myaccount.google.com/apppasswords).

Configuration serveur **non** requise ; expérience moins fluide.

---

## Checklist rapide (tu es où ?)

- [ ] Projet **CloudityConsole** sélectionné
- [ ] **Gmail API** activée
- [ ] Écran de consentement : nom **Cloudity**, emails support + développeur
- [ ] Scopes : `https://mail.google.com/`, `openid`, `email`
- [ ] **Utilisateurs test** : ton Gmail ajouté
- [ ] ID client **Application Web** créé
- [ ] URI redirect : `localhost:6002/...` **et** `https://api.cloudity.delhomme.ovh/...`
- [ ] ID client + secret notés (hors Git)
- [ ] *(Plus tard)* `.env` local phase B
- [ ] *(Bien plus tard)* DNS + NPM + Portainer phase C

---

## Liens

- [DEPLOIEMENT-VPS-PORTAINER-NPM.md](../operations/DEPLOIEMENT-VPS-PORTAINER-NPM.md) — prod `delhomme.ovh`
- [SECRETS.md](../securite/SECRETS.md) — ne jamais committer `GOOGLE_OAUTH_CLIENT_SECRET`
- `.env.example` — variables commentées en bas du fichier
