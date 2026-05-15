# Anti-spam, anti-abus et périmètre « intelligent » — Cloudity

**Rôle** : cadrer une défense **multi-couches et progressive** (chaque couche réduit le volume avant la suivante), en **séparant clairement** le trafic **HTTP** (apps Cloudity, API) du trafic **SMTP/IMAP** (messagerie Internet). Évite les pièges « tout ML » ou « tout WAF » qui cassent l’envoi légitime ou les intégrations IMAP.

**Documents liés** : **[../securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md](../securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md)** (chiffrement mail vs Pass + principes « ne pas bloquer l’envoi légitime ») · **[../securite/SECURITE.md](../securite/SECURITE.md)** (WAF, Zero Trust) · **[../produit/SYNC-BACKLOG.md](../produit/SYNC-BACKLOG.md)** § 0e · **[../operations/PERFORMANCES-MONITORING.md](../operations/PERFORMANCES-MONITORING.md)** (surveillance ressources) · **[../../BACKLOG.md](../../BACKLOG.md)** (lignes AS-*) · **[../../STATUS.md](../../STATUS.md)** (priorités Mail / stack MTA).

---

## 1. Principe fondateur

Le filtrage doit être **multi-couches** et **progressif** : de la couche réseau / edge jusqu’à la logique métier, **chaque couche réduit le bruit** avant la suivante. Aucune couche ne doit être la seule ligne de défense ; une couche « intelligente » (ML) vient **après** des garde-fous déterministes (rate limit, Rspamd, quotas).

**Objectif produit** : bloquer le spam et l’abus **sans** empêcher un utilisateur légitime d’**envoyer** ou de **recevoir** du courrier (faux positifs gérés par quarantaine, ré-apprentissage, déblocage manuel).

---

## 2. Deux chemins distincts (à ne jamais confondre)

| Chemin | Entrée typique | Couches anti-abus |
|--------|----------------|-------------------|
| **A. HTTP / API** | Navigateur, apps Flutter, intégrations REST | Edge (WAF / reverse-proxy) → **api-gateway** (JWT, rate limit) → **auth-service** → services métier |
| **B. SMTP / IMAP** | Serveurs tiers, relais, clients mail classiques | DNS (SPF) → MTA (**Postfix**) → filtrage contenu (**Rspamd** + DNSBL) → boîte (**Dovecot**) ; le **mail-directory-service** (Go) orchestre IMAP/SMTP côté Cloudity mais **ne remplace pas** le filtrage MTA sur le courrier entrant |

Le schéma « Internet → WAF → Gateway → … » s’applique surtout au **chemin A**. Le **chemin B** suit les standards messagerie (RFC) : le filtrage anti-spam **entrant** et une partie de la **réputation sortante** se font au niveau **MTA** (cible projet : **Postfix + Dovecot + Rspamd** — déjà listé dans **STATUS.md** / roadmap Mail).

---

## 3. Chemin A — HTTP (api-gateway et services)

Schéma logique (aligné sur la vision multi-couches, **sans** imposer une techno unique à chaque étape) :

```text
Internet
  → L0  Reverse-proxy / TLS (NPM, Caddy, nginx) — terminaison TLS, HSTS, headers
  → L1  WAF / limites edge (rate par IP, geo si pertinent, fail2ban côté **hôte VPS** sur journaux nginx)
  → L2  api-gateway (Go) — JWT, strip headers internes, **rate limit** (déjà partiellement en place sur login/register — BACKLOG)
  → L3  auth-service — lockout login, 2FA, WebAuthn, recovery codes
  → L4  Services métier — règles domaine (ex. quotas envoi mail **via API** `POST /mail/me/send`, validation pièces jointes)
```

### 3.1 api-gateway « intelligent » (priorité Cloudity)

**Court terme (cohérent avec le code actuel)** :

- Renforcer le **rate limiting par route** (clés `IP`, `IP+endpoint`, `user_id+endpoint` quand JWT présent) avec **Redis** déjà présent dans la stack — **pas** obligatoire d’ajouter un second conteneur Redis dédié « spam » : utiliser des **préfixes de clés** (`ratelimit:`, `spam:score:`) et des TTL stricts.
- Table de **limites par endpoint** documentée (exemples de cibles, ajustables) :
  - `POST /auth/login`, `POST /auth/register` : strict (anti brute-force — déjà amorcé).
  - `POST /mail/me/send` : modéré par **utilisateur** (anti spam sortant via API).
  - `GET` listes / sync : large mais borné (anti scraping).

**Moyen terme** :

- **Sliding window** ou token bucket **centralisé** dans la gateway (implémentation Go à valider en revue de perf — l’exemple Redis ZSET type « Perplexity » est une **piste**, pas une obligation de copier-coller).
- Journalisation structurée des **décisions** (autorisé / limité / 429) pour alimenter un futur scoring (sans loguer de secrets ni corps complets des mails).

**Long terme (optionnel)** :

- Microservice **`antispam-service`** (Python/FastAPI) appelé par la gateway en **async** avec **timeout court** et **repli** sur règles statiques si indisponible — voir § 6.

### 3.2 Ce que nous **ne** promettons **pas** dans le compose actuel

Le dépôt **n’embarque pas** aujourd’hui Prometheus/Grafana dans `docker-compose.yml`. Toute mention de « dashboard Grafana obligatoire » est **hors état réel** : les métriques fines (compteurs `spam_blocked_total`, histogrammes de scores) relèvent du backlog **TR-06** / observabilité (**[PERFORMANCES.md](../operations/PERFORMANCES.md)**). Les scripts **`make perf-*`** couvrent déjà une partie du **runtime conteneurs** côté dev.

---

## 4. Chemin B — SMTP / IMAP (messagerie)

### 4.1 Rspamd comme brique principale (anti-spam « intelligent » classique)

Pour le courrier **Internet**, la couche la plus efficace et standard reste **Rspamd** (bayésien, DNSBL, SPF/DKIM/DMARC, greylisting configurable, réglages par utilisateur « spam / pas spam »). Elle s’intègre naturellement à **Postfix** / **Dovecot** prévus dans la roadmap Mail.

**Principe** : le score Rspamd conduit à **déplacer** le message (dossier Junk, quarantaine) plutôt qu’à **supprimer silencieusement** — réduit les faux positifs catastrophiques.

### 4.2 SPF / DKIM / DMARC

Côté **réputation sortante** et lutte anti-spoofing : politique DNS correcte + alignement **From** / **Return-Path**. Documenté au fil de l’implémentation stack mail (voir **STATUS.md** « Stack mail »).

### 4.3 Lien avec le chiffrement

Le **chiffrement des secrets IMAP/SMTP** en base (clé `MAIL_PASSWORD_ENCRYPTION_KEY`) est documenté dans **[SECURITE-DONNEES.md](../securite/SECURITE-DONNEES.md)**. Ce n’est **pas** le même problème que le **chiffrement du corps des mails** (S/MIME, OpenPGP) — voir **[MAIL-CHIFFREMENT-ET-ANTI-SPAM.md](../securite/MAIL-CHIFFREMENT-ET-ANTI-SPAM.md)**.

---

## 5. Couche « scoring » et ML en ligne (évolution)

Inspirations externes utiles (River, ADWIN, Chantilly, MLflow, Redis Streams) — **à intégrer seulement quand** :

1. La stack **MTA + Rspamd** est en place et stable.
2. Les **rate limits gateway** couvrent les abus HTTP évidents.
3. Vous avez un **volume de logs labellisés** (spam confirmé / ham confirmé) ou un besoin réel de **détection d’anomalies** non supervisée.

### 5.1 Rôle du futur `antispam-service`

- Entrée : **vecteur de features** dérivé de la requête HTTP (ou d’un résumé d’événement MTA) — **jamais** le corps complet d’un mail en clair si politique zero-access.
- Sortie : **score** 0..1 + **raisons** exploitables (audit).
- Mise à jour : **online learning** (ex. **River** : `HalfSpaceTrees`, `ADWIN` pour drift, forêts adaptatives) — **optionnel** ; **Chantilly** peut servir de serveur REST autour de River si on veut éviter de réinventer l’API.
- **MLflow** (self-hosted) : **optionnel** — versioning de modèles, snapshots lorsque ADWIN signale un drift ; utile si plusieurs modèles ou rollback fréquent.

### 5.2 Pipeline de données

**Redis Streams** (`XADD` depuis la gateway ou un sidecar léger) est **pertinent** car Redis existe déjà — évite Kafka tant que le débit ne le justifie pas. Consommation par **`antispam-service`** en **batch** ou **temps quasi réel** selon charge.

### 5.3 Vowpal Wabbit

Réserver aux volumes **très** élevés ; complexité ops + surface d’attaque supplémentaire. Hors scope initial.

---

## 6. Ordre d’implémentation recommandé (par rapport au reste du projet)

| Phase | Quand | Quoi |
|-------|--------|------|
| **AS-0** | **Maintenant (doc)** | Ce fichier + **MAIL-CHIFFREMENT-ET-ANTI-SPAM.md** + liens STATUS/BACKLOG/SYNC — **aucun code obligatoire**. |
| **AS-1** | **Pendant / après Mail Core MVP** | Stack **Postfix + Dovecot + Rspamd** ; dossier Spam UI (**ROADMAP M7**) ; SPF/DKIM/DMARC minimal. |
| **AS-2** | **Après** gateway stable | Rate limits **granulaires** sur `api-gateway` (Redis, clés documentées) ; alignement avec **SECURITE.md** § WAF edge. |
| **AS-3** | **Post sprint Pass** (ou parallèle si ressource) | WAF / ModSecurity en **mode détection** ; fail2ban sur **hôte** VPS (pas dans le conteneur app). |
| **AS-4** | **Quand logs exploitables** | Métriques + historique (**TR-06**) ; éventuellement Prometheus **à ajouter** au compose si la décision produit est prise. |
| **AS-5** | **Optionnel, maturity** | `antispam-service` + River + Streams + feedback utilisateur (`/learn`) ; MLflow si besoin de registry. |

**Règle de priorité** : ne **pas** démarrer AS-5 tant que **AS-1** (Rspamd + UX spam) n’est pas au moins en **beta** — sinon le ML n’a ni labels fiables ni baseline.

---

## 7. Cohabitation avec le chiffrement Pass

Le **Pass** (coffre, **E2EE client** selon **PASS-CRYPTO.md**) et la **messagerie** (interop SMTP/IMAP) n’ont **pas** le même modèle de menace. Le filtrage anti-spam sur **contenu** doit respecter la politique de confidentialité : si un jour le corps est E2EE côté client, le **serveur** ne pourra pas en faire de l’ML classique — il restera sur **métadonnées**, **réputation**, et **signaux transport**. Ce point est explicite dans **MAIL-CHIFFREMENT-ET-ANTI-SPAM.md**.

---

## 8. Références externes (pistes, pas obligations)

- [River](https://github.com/online-ml/river) — ML incrémental.
- [Chantilly](https://github.com/online-ml/chantilly) — déploiement REST autour de River.
- [MLflow](https://mlflow.org/) — cycle de vie des modèles (optionnel).
- [Rspamd](https://rspamd.com/) — filtrage messagerie.

---

*Document vivant : ajuster les phases AS-* quand la stack MTA est branchée ou que TR-06 avance.*
