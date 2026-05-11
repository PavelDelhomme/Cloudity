# PLAN — hub « pourquoi / comment » + dépannage Mail web

> **Lecture rapide** : avec **[TODO.md](TODO.md)** (liste d’actions et priorités), ce fichier suffit souvent au quotidien. Le détail long (roadmap, STATUS, SYNC, TESTS) reste dans les autres `.md` — voir **§8** ci-dessous.

## 8. Carte des autres documents (quand ouvrir quoi)

| Fichier | Quand l’ouvrir |
|---------|----------------|
| **[TODO.md](TODO.md)** | Priorités dev, rappels techniques, lien vers ce PLAN ; § **Ordre de livraison** (web puis mobile) |
| **[VISION-SUITE.md](../produit/VISION-SUITE.md)** | Ordre produit **long terme** (Mail → Alias → Pass → …) + **état réel** du dépôt ; complète TODO/BACKLOG sans les remplacer |
| **[MOBILES.md](../produit/MOBILES.md)** | § **0** : règle **web avant mobile** ; matrice produit × plateforme, `make run-mobile` |
| **[../BACKLOG.md](../../BACKLOG.md)** | Cases à cocher produit condensées |
| **[STATUS.md](../../STATUS.md)** | Suivi détaillé apps, §1c Mail/Drive/… |
| **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** | IMAP, mobile, archivage mail, session |
| **[TESTS.md](TESTS.md)** | Commandes et couverture de tests |
| **[ROADMAP.md](../produit/ROADMAP.md)** | Fiches par application (APP-0x) |
| **[PlanImplementation.md](../produit/PlanImplementation.md)** | Phases long terme |
| **[PERFORMANCES.md](PERFORMANCES.md)** | Stack, conteneurs, techno par couche ; diagnostic ; leviers et alternatives ; explication `profiling-data*` / `Trace-*` |

## 8bis. Catalogue apps (cadre de decision)

Le catalogue "100+ idees d'apps" est retenu comme reservoir produit, avec une regle simple:

1. **Priorite immediate**: Drive, Mail, Photos, Password Manager.
2. **Priorite suivante**: Calendar, Notes, Tasks, Contacts.
3. **Catalogue additionnel en dernier**: Bookmarks/Read later, Wiki, Kanban, Forms, Sites, Journal/Habits, Snippets, RSS/Scanner, Receipts, PKM/Graph, Whiteboard, PDF annotation, Workflow automation, Activity stream, Developer hub, Secure share center, Backup/Device center, etc.
4. **Reporter les blocs a tres forte complexite** (chat temps reel complet, visio complete, CRM/no-code/home automation/e-signature/marketplace/assistant IA transversal).
5. **Ne pas dupliquer les suivis**: execution dans **`TODO.md`** / **`BACKLOG.md`**, etat dans **`STATUS.md`**, sync/offline dans **`SYNC-BACKLOG.md`**, couverture dans **`TESTS.md`**.

## 9. Mail web — synchronisation par boîte (livré)

## 9bis. Performance & traçabilité globale (lancé)

- **Base livrée** : endpoint admin **`/admin/performance/overview`** + carte dashboard admin pour consulter CPU/Mémoire/IO runtime.
- **Interprétation** : c’est un **snapshot** (instantané), pas encore une courbe historique multi-services.
- **Objectif phase suivante** : observabilité systématique (services + tests + tâches background) :
  - métriques normalisées par service (latence/erreurs/CPU/Mémoire/IO) ;
  - stockage séries temporelles ;
  - visualisation dans l’admin ;
  - budgets et alertes de non-régression ressources.

### Mise à jour 2026-05-06 — ergonomie compose & popups

- Le compose mail utilise maintenant une zone riche HTML (`contentEditable`) avec actions rapides (gras, italique, souligné, listes, lien).
- Le transfert ouvre un compose intitulé `Transférer le message`, avec reprise du message source en HTML.
- La programmation d’envoi n’utilise plus `window.prompt` : une modale dédiée date/heure est utilisée.
- Les modales `Paramètres Mail` et `Ajouter une boîte mail` se ferment au clic en dehors de la fenêtre.

- **Colonne « Boîtes mail »** : à droite de chaque boîte, une icône **↻** lance **`POST /mail/me/accounts/:id/sync`** pour **cette boîte uniquement** (mot de passe déjà stocké côté serveur si besoin). Panneau réduit : icône sous l’icône enveloppe.
- **En-tête de liste** : **« Actualiser cette boîte »** = même sync pour la boîte **actuellement affichée**.
- **Paramètres Mail** : **« Sync maintenant »** (rapide) vs **« Sync avec mot de passe… »** (modale si le serveur exige une resaisie).
- **Polling auto** : batch unique (toutes boîtes) avec garde **anti-chevauchement**, **anti-rafale**, et **pause si onglet non visible** ; badge visuel en bas de la sidebar (`Sync auto en cours…`). **Cadence (2026-04)** : sur `/app/mail` (onglet visible) tick **~12 s** ; watcher **hors** page Mail **~18 s** ; **sync forcée** après **envoi** d’un message. Sans push IMAP, les arrivées restent dépendantes du polling — réduire encore = plus de charge serveur / fournisseur.

## 10. Mail web — boucle React "Maximum update depth" (avril 2026)

- **Symptôme** : warning React `Maximum update depth exceeded` sur `MailPage`, navigation `/app/mail` instable (retours Drive/Hub perturbés).
- **Cause probable** : `MailPage` s’abonnait au **contexte AppPageChrome complet** : à chaque mise à jour de `breadcrumbActions`, la page se ré-rendait et pouvait repousser un nouveau nœud dans `setBreadcrumbActions` → boucle.
- **Correctifs appliqués** : (1) **`appPageChromeContext.tsx`** : deux contextes — **setters stables** (`useAppPageChromeSetters`) vs **affichage** (`breadcrumbActions` / `shellSearchAdjacent`) ; les slots `BreadcrumbAppActionsSlot` / `ShellSearchAdjacentSlot` ne lisent que l’affichage. (2) **`MailPage.tsx`** : enregistre le breadcrumb via les setters uniquement ; nœud mémoïsé **`MailAppChromeMenu`** (`MailPageChrome.tsx`). (3) Historique : garde anti-réécriture effets, `setComposeSlots` conditionnel, avatar mail simplifié.
- **Validation** : Vitest Docker (**`make test-dashboard-one …mail/MailPage.test.tsx`**) ; Playwright **`make test-e2e-playwright-mail`** (6 tests : titre page, hub, fil d’Ariane, navigation Mail ↔ Drive + écoute **`Maximum update depth`**) — stack **`make up`** ; compte démo si DB vide (**`make seed-admin`**). Navigation manuelle optionnelle pour sessions longues.
- **File d’attente** : une seule sync manuelle à la fois (évite la surcharge IMAP) ; le **polling ~25 s** continue d’actualiser **toutes** les boîtes en arrière-plan.

## 10. Tests Docker — smokes sans retaper `docker compose`

- **`make test`** : toute la batterie unitaire / applicative (recommandé avant merge).
- **`make test-auth`** : uniquement **auth-service** (`go test` dans l’image).
- **`make test-go-one SERVICE=<clé-compose>`** : un autre service Go (`mail-directory-service`, `drive-service`, …). Tableau et équivalent `docker compose …` : **[TESTS.md](TESTS.md)** § 1.

## 11. Migrations SQL & évolution schéma

- **Appliquer** : **`make migrate`** à la racine (Docker, service **`db-migrate`**) ; ou **`make rebuild`** après mise à jour du code incluant de nouveaux fichiers sous **`infrastructure/postgresql/migrations/`**. **`make up`** enchaîne déjà **`db-migrate`** pour les services qui en dépendent.
- **`make test`** ne constitue pas un substitut aux migrations : il teste le code ; le schéma doit être à jour séparément (voir **TESTS.md**).
- **À terme (produit / ops)** : vision d’un **outil ou écran admin** (web + mobile admin) pour visualiser la version de schéma, l’historique des migrations et les garde-fous — pas encore implémenté ; suivi **STATUS**, **TODO**, **SYNC-BACKLOG §0d**.

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

Les anciennes itérations du Mail web chargeaient des favicons externes par domaine d’expéditeur, ce qui pouvait générer du bruit réseau (`301/404`) et contribuer à des re-renders parasites.

**État courant** : l’avatar de liste utilise désormais les **initiales** côté UI (sans dépendance favicon externe) pour stabiliser l’affichage et réduire le bruit console/réseau.  
**Suite possible** : si besoin produit, réintroduire des icônes via un cache **interne Cloudity** (pas d’appels tiers directs).

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
- **À faire produit** (si ce n’est pas déjà dans votre **BACKLOG.md**) : alias **temporaires / expiration**, vue **récap** tous domaines, alignement **DNS/MX** self-host — voir **[BACKLOG.md](../../BACKLOG.md)** et **[ROADMAP.md](../produit/ROADMAP.md)** **APP-04**.

---

*Mise à jour 2026-04-30 : §8 inclut **VISION-SUITE.md** et **PERFORMANCES.md** ; §8–11 (hub, sync par boîte, smokes, migrations / backlog admin) ; sections 1–7 = console / dates corbeille.*
