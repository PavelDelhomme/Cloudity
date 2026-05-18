# Vision réseau décentralisé (phase tardive — hors MVP)

**Statut** : cadrage uniquement — **ne pas implémenter** avant stabilisation Mail/Pass, déploiement VPS, MTA (**AS-1**, **MAIL-ALIAS-05**).

## Idée (référence utilisateur)

- **DHT** (table de hachage distribuée) : annuaire éclaté entre les nœuds du réseau pour le routage.
- Chaque nœud **relaye du trafic chiffré** (contenu illisible pour le relais).
- Les pairs **échangent les données** sans exposer leur **IP** en clair (objectif type mixnet / onion routing simplifié).

## Rapport avec Cloudity aujourd’hui

| Aujourd’hui (MVP) | Vision tardive |
|-------------------|----------------|
| PostgreSQL central, API gateway, IMAP/SMTP classiques | Données applicatives + routage sur réseau de pairs |
| Chiffrement Pass **côté client** (coffre) | Chiffrement **transport** et **stockage** distribué pour d’autres données |
| Alias / mail via hébergeur ou futur MTA Cloudity | Routage mail **sans** dépendre d’un seul fournisseur |

## Quand l’envisager

- **BACKLOG** : ticket **`ARCH-DHT-01`** (fin de roadmap, après prod stable).
- Prérequis : modèle de menace documenté, légalité hébergement relais, tests de charge, pas de régression sur le parcours `admin@cloudity.local` + boîtes IMAP réelles.

## Liens

- Sécurité actuelle : `docs/securite/SECURITE.md`, `MTLS-INTERNE.md`
- Mail centralisé actuel : `mail_messages` + sync IMAP — voir **`MAIL-STOCKAGE-CACHE.md`** (cache local + rétention)
