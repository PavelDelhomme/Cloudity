# Sécurité & confiance — vision Cloudity (Google + Proton + Zero Trust)

**Rôle** : cadrage **produit et architecture** pour viser une suite **type Google** (UX, sync, recherche, galerie) tout en montant en **niveau Proton** (confidentialité, E2EE / zero-access là où c’est choisi). Complète **[SECURITE-DONNEES.md](./SECURITE-DONNEES.md)** (chiffrement au repos, durcissement HTTP, TR-01 court terme) et **[ROADMAP.md](./ROADMAP.md)** (TR-01, TR-07). **Performances** : toute optimisation doit rester **compatible** avec ce cadre — voir **[PERFORMANCES.md](./PERFORMANCES.md)** §6. **Tests** : **[TESTS.md](./TESTS.md)** (`make test-security` + §4).

**Branche de référence** (fin 2025 / 2026) : `feat/photos-gallery-mobile-sync-security` — l’état **réel** du code reste la source de vérité ; ce document fixe les **objectifs** et l’**ordre d’implémentation**.

---

## 1. Positionnement : les deux références

| Axe | Ce que Google fait bien | Ce que Proton incarne | Ambition Cloudity |
|-----|-------------------------|----------------------|-------------------|
| **Disponibilité** | Sync transparente, multi-appareils, recherche puissante | Moins d’index « magique » sur le contenu en clair | **Hybride** : espaces *standard* (performant) vs *privés* (chiffrement renforcé) |
| **Confiance** | Tout passe par leur cloud | E2EE, zero-access, clés côté client | **Transparence** : l’utilisateur sait ce que le serveur peut ou ne peut pas voir |
| **Mobile** | Backup photo, UX fluide | Apps orientées confidentialité | **Même barre UX** (backup, timeline) + règles batterie / Wi‑Fi — **MOBILES.md**, **PHOTOS.md** |

**Formulation produit** : *« Tes données sont disponibles partout, rapides à retrouver, faciles à partager — et **illisibles pour l’infrastructure** dans les espaces que tu marques comme privés. »*

---

## 2. Quatre couches (moteur transversal)

1. **Moteur de sync** — delta, reprise après coupure, files d’attente, conflits, versioning ; observable (progression, ETA). Sans sync fiable, le reste ne tient pas.
2. **Plateforme fichiers** (Drive) — arborescence, corbeille, partage, quotas, prévisualisation ; aligné **SYNC-BACKLOG**, **ROADMAP** Drive.
3. **Plateforme Photos** — timeline, albums, métadonnées, mobile en arrière-plan — **PHOTOS.md**.
4. **Plateforme sécurité / privacy** — auth, clés, audit, détection d’abus, politiques — ce fichier + **SECURITE-DONNEES.md**.

**Architecture cible (services logiques)** — même si le dépôt reste modulaire monorepo : identité ; gestion de clés *client-centric* pour espaces privés ; métadonnées ; blobs ; moteur de sync ; partage ; pipeline photo ; index / recherche (avec compromis clair si E2EE) ; audit / sécurité.

---

## 3. Phases d’implémentation (ordre rentable)

### Phase 1 — Crédibilité « stockage sérieux »

- Sync **fiable** (reprise, idempotence, corbeille, versioning minimal).
- Partage par **lien** simple + permissions de base.
- Backup photo mobile **MVP** (déjà amorcé côté Photos).
- Chiffrement **transport** (TLS) + **au repos** serveur où pertinent — **SECURITE-DONNEES.md**.
- Architecture prête à brancher **E2EE** (enveloppes de clés, séparation métadonnées / blobs) sans tout refondre le jour J.

### Phase 2 — Confiance & produit

- **E2EE** sur espaces privés (zero-access sur contenu, idéalement noms + métadonnées selon compromis).
- Galerie **timeline**, albums, recherche sur **métadonnées** / tags (selon modèle de chiffrement).
- Apps **mobiles** stables ; **audit log** ; gestion des **sessions / appareils** (révocation).

### Phase 3 — Niveau « au-dessus »

- Partage **E2EE** (lien + mot de passe / clé dérivée ; penser **révocation** dès la conception — re-chiffrement ou enveloppes par destinataire).
- Clés de **groupe** / équipe avec rotation.
- Recherche **privée** (index local chiffré sync entre appareils de confiance — alternative à l’index serveur en clair).
- Détection **anti-ransomware** (snapshots, anomalies de masse).
- **Snapshots** ou politiques d’immutabilité configurable.

### Phase 4 — Différenciants premium

- Albums intelligents, déduplication perceptuelle (hors MVP confidentialité).
- Workflows documents / photos ; multi-persona (perso, famille, équipe).

**Priorité absolue** si une seule chose doit passer avant le reste : **sync fiable + versioning + corbeille** ; puis **partage** ; puis **backup photo** ; puis **E2EE ciblé** ; puis recherche / détection avancées.

---

## 4. Chiffrement des requêtes **et** signature des messages

- **TLS** : confidentialité et intégrité **sur le canal** ; ne prouve pas à l’application que le **body** n’a pas été rejoué ou altéré après terminaison TLS au proxy.
- **Signature applicative** (ex. **HTTP Message Signatures**, **HMAC** sur une *canonical string*) : **intégrité** et **authenticité** de l’émetteur sur des champs explicitement signés (méthode, chemin, `Content-Digest`, **horodatage**, **nonce**, `key-id`).

**Bon schéma (endpoints critiques)** : fenêtre de temps courte ; **nonce** stocké côté serveur (anti-rejeu) ; hash du body ; **scopes** métier vérifiés après la crypto.

**Rappel** : une requête **bien signée** peut rester **interdite** si l’utilisateur n’a pas le droit — la signature **ne remplace pas** l’autorisation.

**Cloudity** : à planifier pour **webhooks**, **exports**, **suppressions massives**, **rotation de clés** ; pas nécessaire sur **toutes** les routes (coût, faux positifs). Piste : **mTLS** inter-services + signatures sur actions **admin** / **machine**.

---

## 5. Zero Trust (principe)

**Définition courte** : *ne faire confiance à rien par défaut* — ni au « réseau interne », ni au poste « déjà vu ». Chaque accès à une ressource est **réévalué** selon une politique (identité, MFA, appareil, contexte, sensibilité).

**Principes** : *never trust, always verify* ; **moindre privilège** ; **assume breach** (segmentation, journaux, révocation rapide).

**Traduction concrète pour Cloudity** :

- Chaque **API** vérifie identité + **scopes** ; pas d’« confiance VPN » à la place.
- **Services → services** : identité de workload (mTLS ou tokens de service courts).
- **Admin** : chemins isolés, MFA / step-up sur actions à risque.
- **Télémétrie** : échecs d’auth, signatures invalides, volumes anormaux — alimenter **audit** et alertes.

Zero Trust n’est **pas** un produit unique : c’est un **modèle** (IAM, PEP/PDP, posture device, logs) — à intégrer **progressivement** avec la gateway et les politiques tenant.

---

## 6. WAF (pare-feu applicatif) — périmètre réseau / edge

**Rôle** : filtrer le trafic **HTTP(S) couche 7** (signatures OWASP CRS, rate limiting, bot score) **avant** l’application. **Ne remplace pas** un code sain ni les contrôles **métier** (IDOR, logique).

**Placement typique** : reverse proxy (ex. NGINX + **ModSecurity** + CRS), **ingress** Kubernetes, ou WAF **edge** / CDN.

**Rapport avec Cloudity** : couche **infra** (hors repo applicatif ou en `docker-compose` / chart dédié) ; commencer en **mode détection**, réduire les faux positifs, puis durcir sur `/login`, `/admin`, uploads.

*Sujet distinct* des signatures **applicatives** §4 : le WAF protège le **périmètre** ; les signatures de requêtes protègent la **logique d’API critique** derrière TLS.

---

## 7. Recherche vs confidentialité

Plus le serveur indexe du **contenu en clair**, plus la recherche est « magique » ; en **E2EE strict**, l’indexation globale côté serveur devient impossible sans compromis.

**Modèle recommandé (hybride)** :

1. Espaces **standard** : index serveur (métadonnées / texte selon TR-01).
2. Espaces **privés** : index **local** sur l’appareil + sync chiffrée d’index entre appareils de confiance.
3. **Recherche limitée** sur tags / champs chiffrés de façon **exploitable** seulement si le design de clés le permet.

Documenter pour chaque feature **ce que le serveur voit**.

---

## 8. Liens utiles

| Document | Contenu |
|----------|---------|
| **[SECURITE-DONNEES.md](./SECURITE-DONNEES.md)** | TLS, cookies, CSP, chiffrement au repos, Pass/Mail long terme |
| **[SYNC-BACKLOG.md](./SYNC-BACKLOG.md)** | Sync, mobile, session, archivage |
| **[BACKLOG.md](../BACKLOG.md)** | Cases à cocher priorisées racine |
| **[TESTS.md](./TESTS.md)** | `make test-security`, dettes tests sécurité |
| **[ROADMAP.md](./ROADMAP.md)** | TR-01, TR-07, APP-xx |
| **[PERFORMANCES.md](./PERFORMANCES.md)** | Leviers perf / alternatives ; contraintes sécurité §6 |

---

*Document d’alignement équipe / produit. À mettre à jour quand une phase est livrée (STATUS + BACKLOG).*
