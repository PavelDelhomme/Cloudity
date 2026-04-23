# PLAN — hub « pourquoi / comment » + dépannage Mail web

> **Lecture rapide** : avec **[TODO.md](./TODO.md)** (liste d’actions et priorités), ce fichier suffit souvent au quotidien. Le détail long (roadmap, STATUS, SYNC, TESTS) reste dans les autres `.md` — voir **§8** ci-dessous.

## 8. Carte des autres documents (quand ouvrir quoi)

| Fichier | Quand l’ouvrir |
|---------|----------------|
| **[TODO.md](./TODO.md)** | Priorités dev, rappels techniques, lien vers ce PLAN |
| **[../BACKLOG.md](../BACKLOG.md)** | Cases à cocher produit condensées |
| **[STATUS.md](../STATUS.md)** | Suivi détaillé apps, §1c Mail/Drive/… |
| **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** | IMAP, mobile, archivage mail, session |
| **[TESTS.md](./TESTS.md)** | Commandes et couverture de tests |
| **[ROADMAP.md](./ROADMAP.md)** | Fiches par application (APP-0x) |
| **[PlanImplementation.md](./PlanImplementation.md)** | Phases long terme |

## 9. Mail web — synchronisation par boîte (livré)

- **Colonne « Boîtes mail »** : à droite de chaque boîte, une icône **↻** lance **`POST /mail/me/accounts/:id/sync`** pour **cette boîte uniquement** (mot de passe déjà stocké côté serveur si besoin). Panneau réduit : icône sous l’icône enveloppe.
- **En-tête de liste** : **« Actualiser cette boîte »** = même sync pour la boîte **actuellement affichée**.
- **Paramètres Mail** : **« Sync maintenant »** (rapide) vs **« Sync avec mot de passe… »** (modale si le serveur exige une resaisie).
- **File d’attente** : une seule sync manuelle à la fois (évite la surcharge IMAP) ; le **polling ~25 s** continue d’actualiser **toutes** les boîtes en arrière-plan.

---

*Suite : dépannage console et bugs connus (sections 1–7).*

## 1. Messages console « anxiogènes » mais normaux (Vite + React)

| Message | Explication |
|--------|----------------|
| `[vite] connecting…` / `[vite] connected` | Client de **rechargement à chaud** (HMR). **Normal** en `npm run dev`. |
| « Download the React DevTools… » | Suggestion React en **développement** uniquement. **Ignorer** ou installer l’extension si vous voulez le profiler. |

Ce ne sont **pas** des erreurs applicatives.

## 2. Avertissements CSS « Declaration dropped » / propriété inconnue

Exemples typiques dans la console **Firefox** :

- `Error in parsing value for '-webkit-text-size-adjust'`
- `Unknown property '-moz-osx-font-smoothing'`
- `Unknown property 'mso-table-lspace'` / `mso-table-rspace`
- `Unknown property '-moz-column-gap'`

**Cause** : le corps des e-mails est souvent du **HTML tiers** (Outlook, newsletters, etc.). Quand le Mail web affiche un **aperçu HTML** (iframe, `srcDoc`, styles injectés), le navigateur **analyse** ces règles CSS : il **rejette** les propriétés qu’il ne comprend pas (préfixes WebKit, directives **Microsoft Office** `mso-*`, etc.).

**Ce n’est en général pas un bug Cloudity** : ce sont des avertissements de **feuille de style distante**, pas un plantage de l’API. Pour réduire le bruit : politique **CSP** / sanitizer plus strict (backlog sécurité affichage mail).

## 3. Requêtes XHR `GET …/mail/…` en **200 OK**

Les lignes du type :

```text
XHRGET http://localhost:6080/mail/me/accounts … [HTTP/1.1 200 OK …]
```

indiquent une **réponse réussie**. Ce n’est **pas** une erreur (contrairement à **4xx** / **5xx**).

## 4. Requêtes vers **Google** (`s2/favicons`, `faviconV2`) — 301, 404

Le Mail web affiche une **pastille / favicon** par domaine d’expéditeur. La logique essaie plusieurs URLs (voir `mailFaviconCandidateUrlsFromEmail` dans **`MailPage.tsx`**) : services publics **Google** / **DuckDuckGo**.

- **301** : redirection habituelle du service Google.
- **404** sur `t*.gstatic.com/faviconV2?...` : le moteur n’a **pas** d’icône pour ce domaine exact — l’UI bascule alors sur la **candidate suivante** ou sur les **initiales** (`onError` sur `<img>`).

**Comportement attendu** : pas d’action obligatoire ; amélioration possible : héberger un cache d’icônes côté Cloudity pour limiter les fuites vers des tiers (backlog vie privée).

## 5. Corbeille (Trash) : « À l’instant » / « reçu tout à l’heure » pour un vieux message

### Symptôme

Dans le dossier **Corbeille** (ou un dossier IMAP corbeille), un message (ex. `noreply@jobbingtrack.com`) apparaît comme **très récent** (« À l’instant », « Il y a X min ») alors qu’il est **déjà à la corbeille** sur le serveur.

### Cause (corrigée dans le code)

Dans **`mail-directory-service`**, la sync IMAP (`syncImapMailboxMessages` dans **`imap_folders.go`**) utilisait **`time.Now()`** lorsque l’**enveloppe IMAP** n’avait **pas de date** (`Envelope.Date` vide). La liste Mail affiche `date_at` puis à défaut `created_at` → la date devenait **l’heure de la dernière sync**, d’où l’affichage trompeur.

**Correctif** : ne plus inventer une date ; laisser **`date_at` à NULL** si l’enveloppe n’a pas de date, et en `ON CONFLICT` utiliser **`COALESCE(EXCLUDED.date_at, mail_messages.date_at)`** pour ne pas **écraser** une date déjà connue avec une valeur vide.

Après déploiement : refaire un **POST** `/mail/me/accounts/:id/sync` ; les lignes **déjà** en base avec une mauvaise date peuvent nécessiter une **resync** ou une correction SQL ponctuelle si besoin.

### UX liste (front)

En vues **Corbeille** et **Spam**, le libellé détail sous la ligne n’est plus « Reçu : … » mais **« Date du message : … »** pour éviter l’ambiguïté sémantique (« reçu » vs « supprimé / classé »).

### Pistes si le problème persiste (OVH, `candidatures@…`)

- Vérifier que le dossier **Corbeille** côté UI correspond bien au **`folder=trash`** synchronisé (voir **SYNC-BACKLOG §0b** : chemins IMAP non standard).
- Si **`date_at`** reste NULL pour certains messages : envisager d’extraire la date depuis les **en-têtes RFC822** au prochain fetch corps (backlog **STATUS §1c M8**).

## 6. Alias mail — « système complet »

- **Déjà documenté** : comptes + **alias par boîte** (`user_email_aliases`, API `…/accounts/:id/aliases`), filtre **`delivered_to`**, lien **Pass** — **SYNC-BACKLOG §2**, **TODO.md**, **STATUS** Phase 3 (alias avancés / expiration / UI centralisée).
- **À faire produit** (si ce n’est pas déjà dans votre **BACKLOG.md**) : alias **temporaires / expiration**, vue **récap** tous domaines, alignement **DNS/MX** self-host — voir **[BACKLOG.md](../BACKLOG.md)** et **[ROADMAP.md](./ROADMAP.md)** **APP-04**.

---

*Mise à jour 2026-04 : §8–9 (hub docs + sync par boîte) ; sections 1–7 = console / dates corbeille.*
