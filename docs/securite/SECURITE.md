# Sécurité & confiance — vision Cloudity (Google + Proton + Zero Trust)

**Rôle** : cadrage **produit et architecture** pour viser une suite **type Google** (UX, sync, recherche, galerie) tout en montant en **niveau Proton** (confidentialité, E2EE / zero-access là où c’est choisi). Complète **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)** (chiffrement au repos, durcissement HTTP, TR-01 court terme) et **[ROADMAP.md](../produit/ROADMAP.md)** (TR-01, TR-07). **Performances** : toute optimisation doit rester **compatible** avec ce cadre — voir **[PERFORMANCES.md](../operations/PERFORMANCES.md)** §6. **Tests** : **[TESTS.md](../operations/TESTS.md)** (`make test-security` + §4). **Vérifs post-modif** : **[DEV-VERIFICATION.md](../operations/DEV-VERIFICATION.md)**. **Admin / API** : **[AUDIT-SECURITE.md](AUDIT-SECURITE.md)** (UI `/4dm1n`, gateway `/admin/*`, admin-service, mail admin-only Zero Trust).

**Documents d’implémentation associés** : **[REVERSE-PROXY.md](REVERSE-PROXY.md)** (edge TLS 1.3 + HSTS + CSP + PQ hybride), **[MTLS-INTERNE.md](MTLS-INTERNE.md)** (mTLS services internes, step-ca), **[PASS-CRYPTO.md](PASS-CRYPTO.md)** (format hybride PQ du Vault Pass). **Menaces offensives IA + défense/PQC (planification)** : **[MENACES-IA-ET-DEFENSE.md](MENACES-IA-ET-DEFENSE.md)**. **Messagerie** : **[MAIL-CHIFFREMENT-ET-ANTI-SPAM.md](MAIL-CHIFFREMENT-ET-ANTI-SPAM.md)** (secrets boîte vs corps E2E vs anti-spam) ; **anti-abus multi-couches** : **[../architecture/ANTI-SPAM-ET-ABUS.md](../architecture/ANTI-SPAM-ET-ABUS.md)** (HTTP vs SMTP, Rspamd, gateway, option ML).

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

### 6.1 Énumération d’URLs, d’emails et scanners

**Objectif** : limiter ce qu’un acteur distant peut inférer en **probing** HTTP (chemins, méthodes, codes, corps, délais).

| Risque | Mitigation Cloudity (code / doc) |
|--------|----------------------------------|
| **Découverte de chemins** (`/admin`, `/debug`, versions d’API) | UI admin sous chemin **non trivial** (`/4dm1n`, bundle `admin.html`) ; **`/admin*`** UI **404 explicite** côté Vite dev + nginx prod + AdminApp (router) — **aucune redirection** vers `/4dm1n` (anti-énumération). API gateway : routes inconnues → **404 JSON** uniforme `{"error":"not found"}` ; méthode HTTP interdite → **405 JSON** `{"error":"method not allowed"}` ; voir **[AUDIT-SECURITE.md](AUDIT-SECURITE.md)** § 1. |
| **Credential stuffing / bruteforce login** | Rate limit **global** sur la gateway + **fenêtre plus stricte** sur `POST /auth/login` et `POST /auth/register` ; en prod compléter par **WAF / reverse proxy** (limite par IP, captcha, géo) — §6. |
| **Énumération d’emails à l’inscription** | Conflit d’unicité (email déjà pris) : réponse **409** avec message **générique** (`registration could not be completed`) — ne pas renvoyer « email déjà enregistré » qui confirme l’existence du compte. |
| **Énumération login** (utilisateur inconnu vs mauvais mot de passe) | Déjà : même message **`invalid credentials`** et même code **401** ; **normalisation grossière du temps de réponse** sur `/auth/login` (plancher ~70 ms) pour réduire un canal **timing** (pas une garantie absolue — le réseau domine souvent). |
| **Fuites via en-têtes** | Gateway : **`X-Content-Type-Options: nosniff`**, **`X-Frame-Options: DENY`**, **`Referrer-Policy`**, **`Permissions-Policy`** sur les réponses API ; le reste (HSTS, CSP strict) reste au **reverse proxy** — **REVERSE-PROXY.md**, **SECURITE-DONNEES.md**. |
| **Fuite via cache HTTP / bfcache** (tokens & secrets persistés par un proxy ou par le navigateur) | Gateway : **`Cache-Control: no-store` + `Pragma: no-cache`** posés sur tous les chemins sensibles (`/auth/*`, `/pass/*`, `/admin/*`) — vérifié par `TestSensitivePath_NoStoreCacheControl` (api-gateway). |
| **Crawl public** (Googlebot indexant `/4dm1n`) | **`/robots.txt`** servi par le bundle web : `Disallow: /4dm1n`, `/admin`, `/auth/`, `/api/`, `/pass/`, `/admin.html` — bonne foi du crawler, **pas un contrôle d’accès**. |
| **UI admin servie depuis le bundle utilisateur** | `/4dm1n` est servi par un **bundle séparé** (`admin.html`) : la navigation utilisateur → admin (et inverse) **force `window.location.assign`** plutôt qu’un `Link` react-router, pour qu’un attaquant ou un script ne se retrouve jamais avec une URL `/4dm1n` rendue par le shell utilisateur (et inversement). |
| **ID séquentiels** (deviner `/drive/nodes/123`) | Contrôle d’accès **métier** + RLS côté PG ; à terme identifiants **opaque** (UUID) pour ressources sensibles si le produit le permet. |

**Limites** : un attaquant peut toujours distinguer « route existe » vs « 404 » si le comportement applicatif diffère (taille de corps, latence backend). L’alignement **404/405** et les messages **génériques** réduisent la surface ; la **défense principale** reste l’**auth forte**, les **logs**, le **WAF** et la **segmentation réseau**.

**Suite court terme (suivi exécutable)** : les livrables récents gateway / auth / front sont récapitulés dans **[BACKLOG.md](../../BACKLOG.md)** (section *Sécurité & infra*). Pistes suivantes : WAF + rate limit **par IP**, **audit log** actions sensibles, **scopes JWT** par route, **signatures** requêtes critiques — déjà listés dans le même backlog.

### 6.2 Defense in depth : double contrôle « mail admin-only » (Zero Trust)

Les routes mail **admin-only** (`/mail/domains*`, `/mail/mailboxes*`, `/mail/aliases*`) sont vérifiées **deux fois** :

1. **Gateway** (`api-gateway/main.go`) — JWT EdDSA + claim `role/roles` admin + `Origin` strict. Avant routage, la gateway **strippe** systématiquement `X-User-ID`, `X-Tenant-ID`, **`X-Admin-Role`** (cf. `stripInternalTrustHeaders`) puis ré-injecte ces valeurs après vérif JWT. Un client ne peut pas pré-positionner `X-Admin-Role: admin`.
2. **`mail-directory-service`** (`backend/mail-directory-service/main.go`, middleware `requireAdminRoleForMailDirectory`) — refuse **403** si `X-Admin-Role != admin` sur un chemin admin-only. Un attaquant qui pivote sur le réseau Docker et bypass la gateway tombe quand même sur ce contrôle.

Tests : `TestStripInternalTrustHeaders` (gateway), `TestMailDomainsRequiresAdminRole` + `TestIsAdminOnlyMailDirectoryPath` (mail-directory-service). Cible suivante : **mTLS interne** + identité workload (cf. **[MTLS-INTERNE.md](MTLS-INTERNE.md)**) pour fermer le canal réseau lui-même.

---

## 7. Recherche vs confidentialité

Plus le serveur indexe du **contenu en clair**, plus la recherche est « magique » ; en **E2EE strict**, l’indexation globale côté serveur devient impossible sans compromis.

**Modèle recommandé (hybride)** :

1. Espaces **standard** : index serveur (métadonnées / texte selon TR-01).
2. Espaces **privés** : index **local** sur l’appareil + sync chiffrée d’index entre appareils de confiance.
3. **Recherche limitée** sur tags / champs chiffrés de façon **exploitable** seulement si le design de clés le permet.

Documenter pour chaque feature **ce que le serveur voit**.

---

## 8. Post-quantique (PQ) — cible et migration

**Pourquoi maintenant** : un attaquant peut **archiver** aujourd’hui un trafic chiffré (« *harvest now, decrypt later* ») et le **déchiffrer plus tard** quand un ordinateur quantique utile existera. Tout secret avec une **valeur > 5–10 ans** (vault **Pass**, **mail** E2E, **Drive privé**, exports légaux) doit donc déjà migrer vers un schéma **résistant PQ** — sans casser les clients existants.

**Bonne nouvelle / mauvaise nouvelle** :

- **Symétrique** (AES-256-GCM, ChaCha20-Poly1305) et **hash** (SHA-256, SHA-3, BLAKE2, Argon2id) sont **déjà PQ-safe** (Grover ⇒ AES-256 ≈ 128 bits PQ, encore confortable).  
- **Asymétrique** (RSA, DH, ECDH/ECDSA, EdDSA) **tombe** face à Shor : c’est sur le **KEM** (échange de clés TLS / enveloppes E2EE) et les **signatures** (JWT, certificats, OpenPGP) qu’il faut agir.

### 8.1 Standards de référence (FIPS 2024 / IETF)

| Famille | Standard PQ | Usage prévu Cloudity |
|---------|-------------|----------------------|
| **KEM** (échange de clés) | **ML-KEM** (= **CRYSTALS-Kyber**) — **FIPS 203** | TLS 1.3 hybride, enveloppes E2EE Pass / Drive / Mail |
| **Signatures** | **ML-DSA** (= **CRYSTALS-Dilithium**) — **FIPS 204** | JWT, certificats internes, futures signatures applicatives |
| **Signatures (hash-based)** | **SLH-DSA** (= **SPHINCS+**) — **FIPS 205** | racine de confiance / signatures rares mais ultra-conservatives |
| **Signatures (compactes)** | **FN-DSA** (= **Falcon**) — en cours NIST | option si tailles ML-DSA gênent (certs en ligne) |

**Principe d’implémentation** : **hybride**, **toujours** — *classique ⊕ PQ*. Tant que les implémentations PQ ne sont pas auditées sur la durée, on garde une **couche classique** en parallèle (ex. **`X25519 + ML-KEM-768`**), de sorte qu’une faille d’un seul des deux ne casse pas la confidentialité.

### 8.2 Application par couche

| Couche | Aujourd’hui | Cible PQ | Action repo |
|--------|-------------|----------|-------------|
| **TLS externe** (browser ↔ gateway) | TLS 1.3 (cible) | **TLS 1.3 hybride** `X25519MLKEM768` | choix **reverse proxy** (Caddy 2.8+ / nginx + OpenSSL 3.5+ / BoringSSL / AWS-LC) ; **aucun changement code applicatif** |
| **mTLS interne** | inexistant | mTLS **classique** d’abord, puis certs **hybrides ML-DSA + ECDSA** | introduire **step-ca** / **cert-manager** ; PQ vient après |
| **JWT** | **RS256 / RSA-2048** | palier **Ed25519** → cible **ML-DSA-65** ou **JWT hybride** | dépend de `golang-jwt` + clients ; commencer par **Ed25519** dès stable |
| **Vault Pass (E2EE client)** | non implémenté | enveloppe **hybride** : contenu en `ChaCha20-Poly1305` + clé encapsulée en **`X25519 ⊕ ML-KEM-768`**, KDF **Argon2id** + **HKDF-SHA-256** | **figer le format dès le MVP** Pass pour éviter une migration de tous les coffres |
| **Mail E2E** | non implémenté | **PQ/T hybrid OpenPGP** (drafts IETF `crypto-refresh` + `pq`) | choisir lib alignée (rPGP, futurs binds Go) |
| **Drive / Photos privés** | non chiffrés app | chunks **AES-256-GCM** / **XChaCha20-Poly1305** + clé fichier par destinataire en **`X25519 + ML-KEM-768`** | les **chunks** sont déjà PQ-safe — l’**enveloppe** est ce qu’il faut hybrider |
| **Backups** | non implémentés | **restic** (AES-256-GCM) / **borg** (ChaCha20-Poly1305) ; passphrase via **Argon2id** | déjà PQ-safe pour le contenu |
| **Refresh tokens** | aléa CSPRNG 256 bits + **SHA-256** | identique | rien à changer ; vérifier seulement qu’on **ne descend jamais** sous 256 bits |
| **Hash mot de passe** | **Argon2id** | identique | ajuster paramètres tous les **18–24 mois** |

### 8.3 Plan de migration pragmatique

1. **Court terme — durcir l’existant avant le PQ**  
   - **HSTS** + **CSP** au reverse proxy ; **cookies** httpOnly/Secure/SameSite ; sortir le JWT du `localStorage`.  
   - **TLS 1.3 strict** en prod (désactiver TLS 1.0/1.1).  
   - **mTLS interne classique** (étape **avant** tout PQ inter-services).
2. **Moyen terme — premières briques PQ**  
   - Activer **`X25519MLKEM768`** au reverse proxy quand la chaîne TLS le supporte (déjà répandu côté navigateurs : Chrome/Firefox/Edge 2024–2025, Cloudflare, AWS).  
   - **Ed25519** pour les nouveaux JWT (palier intermédiaire avant ML-DSA).  
   - **Vault Pass** : format **hybride dès la v1** (X25519 + ML-KEM-768 sur la clé d’enveloppe).
3. **Long terme — bascule complète**  
   - **JWT hybrides** ou **ML-DSA-65** quand `golang-jwt` + clients suivent.  
   - **OpenPGP PQ/T hybrid** pour le mail E2E.  
   - **CA interne hybride** ML-DSA + ECDSA pour le mTLS / certs services.

### 8.4 Règle d’or

> **Tout secret chiffré aujourd’hui pour 10 ans doit déjà être encapsulé en hybride.**  
> À défaut, prévoir une **migration ciphertext** côté serveur (réécriture coffres/blobs) — coûteuse, irréversible si la clé maître a fuité.

Tableau d’algorithmes (« best of the best ») unique : **[STATUS.md](../../STATUS.md)** § 2.3 + sous-section *Cible post-quantique*.

### 8.5 Documents d’implémentation

| Périmètre | Document |
|-----------|----------|
| **Norme actionnable** (whitelist / blacklist algos + paramètres exacts + checklist code review) | **[CRYPTO-NORME.md](CRYPTO-NORME.md)** — référentiel obligatoire pour tout PR touchant à la crypto / auth / TLS. |
| **WebAuthn / passkeys** (priorité `/4dm1n`) | **[WEBAUTHN-PLAN.md](WEBAUTHN-PLAN.md)** — phases W1–W4, schéma DB, endpoints, checklist sécurité. |
| **Edge / TLS public** | **[REVERSE-PROXY.md](REVERSE-PROXY.md)** — gabarits Caddy / nginx / Traefik, TLS 1.3 strict, HSTS, CSP report-only → enforce, hybride **`X25519MLKEM768`**. |
| **mTLS interne** | **[MTLS-INTERNE.md](MTLS-INTERNE.md)** — PKI **step-ca**, patterns Go (`internalsec`), bascule progressive `off → permissive → strict`, certs hybrides ML-DSA + ECDSA à terme. |
| **Vault Pass (E2EE client)** | **[PASS-CRYPTO.md](PASS-CRYPTO.md)** — Argon2id + XChaCha20-Poly1305 + KEM hybride **X25519 ⊕ ML-KEM-768**, format `EnvelopeV1` à figer dès la v1. |
| **URL capabilities** (slug rotatif 2FA / settings vs. token de partage stable) | **[URL-CAPABILITIES.md](URL-CAPABILITIES.md)** — HMAC-SHA-256 par `(user_id, purpose, epoch 30 j)` + sliding window (protection **passive** long terme ; pas de reconnexion au refetch — § 2.2–2.4), token aléatoire 192 bits hashé SHA-256 + révocable pour le partage Pass. Suivi : **[TODOS.md](../../TODOS.md)**. **E2E** : pas de bypass UA/header — **[TESTS.md](../operations/TESTS.md)** § *E2E / Playwright — authentification*. |

---

## 9. Liens utiles

| Document | Contenu |
|----------|---------|
| **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)** | TLS, cookies, CSP, chiffrement au repos, Pass/Mail long terme |
| **[SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** | Sync, mobile, session, archivage |
| **[BACKLOG.md](../../BACKLOG.md)** | Cases à cocher priorisées racine |
| **[TESTS.md](../operations/TESTS.md)** | `make test-security`, dettes tests sécurité |
| **[ROADMAP.md](../produit/ROADMAP.md)** | TR-01, TR-07, APP-xx |
| **[PERFORMANCES.md](../operations/PERFORMANCES.md)** | Leviers perf / alternatives ; contraintes sécurité §6 |

---

*Document d’alignement équipe / produit. À mettre à jour quand une phase est livrée (STATUS + BACKLOG).*
