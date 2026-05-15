# Cloudity Pass — format de chiffrement (cible **hybride post-quantique**)

> **Rôle** : figer **dès la v1** le format de stockage des coffres / items du **password manager** Cloudity, de sorte qu’il soit déjà **PQ-safe** (résistant *harvest now, decrypt later*) et n’oblige **pas** à une migration de tous les coffres ensuite. Ce document est la **référence d’implémentation** côté client (Flutter / extension) et côté serveur (`backend/passwords-service`). Vision globale : **[SECURITE.md](SECURITE.md)** § 8. Tableau d’algos : **[STATUS.md](../../STATUS.md)** § 2.3. Court terme produit : **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)**.

**État repo** : `pass_items.ciphertext` est aujourd’hui une **chaîne opaque** côté serveur (`backend/passwords-service/main.go`). Le serveur **ne chiffre / déchiffre rien** — toute la crypto vit côté **client**.

---

## 1. Modèle de menace résumé

| Acteur | Capacité | Doit pouvoir lire ? |
|--------|----------|---------------------|
| **Utilisateur légitime** (clients connectés au compte) | possède le **mot de passe maître** | **Oui** : items en clair. |
| **Serveur Cloudity** (DB Postgres, backups, admins infra) | accès complet aux blobs `ciphertext` et métadonnées | **Non** : *zero-access*. |
| **Attaquant qui a volé la base** | ciphertext + métadonnées | **Non**, et pas même demain (PQ). |
| **Adversaire « harvest now, decrypt later »** | archive ciphertext maintenant, attend 10–20 ans | **Non** : la couche **PQ** doit le bloquer. |
| **Attaquant qui a *compromis le client*** | RAM côté appareil de confiance | hors périmètre crypto (sécu OS / biométrie / verrouillage). |

**Garanties visées** :
- **Confidentialité** des items (login, mot de passe, notes, TOTP, etc.).  
- **Intégrité** + **authenticité** : la moindre modification du ciphertext est détectée à l’ouverture.  
- **PQ-safe** sur le **scellage de clé** (KEM hybride) **et** sur le **chiffrement de contenu** (symétrique 256 bits).

**Hors périmètre v1** : recherche serveur sur le contenu (incompatible avec zero-access strict — cf. SECURITE.md § 7), partage E2EE entre utilisateurs (Phase 3).

### 1.1 Mot de passe maître Pass vs mot de passe du compte Cloudity

- **Compte Cloudity** (email + mot de passe) : authentifie l’utilisateur auprès d’**auth-service** et sert à obtenir le **JWT**. Il est vérifié **côté serveur** et peut être **quelconque** par rapport au Pass.
- **Mot de passe maître Pass** : sert **uniquement** à dériver la **MK** côté **client** pour chiffrer/déchiffrer les entrées. **Aucun service Cloudity ne le connaît** ; il n’est **pas** stocké en clair sur nos serveurs.
- **Démo locale** (`make seed-admin`) : il est courant d’utiliser le **même** mot de passe que celui du compte démo pour simplifier les tests — **confort**, pas une règle produit. **En usage réel**, un mot de passe maître **distinct** (et fort) est recommandé.

### 1.2 Ordre produit (web, mobile, extension)

1. **Authentification Cloudity** (JWT) — route `/app/*` protégée ; sans session, aucun écran Pass « coffre ».
2. **Mot de passe maître** — après connexion : si l’utilisateur n’a **aucun** coffre côté `passwords-service`, l’UI web propose l’**initialisation** (choix + confirmation du maître) ; sinon **déverrouillage** avec le maître déjà utilisé pour chiffrer.
3. **Données hors coffre** (ex. enregistrement d’**alias mail** pour filtres) : APIs distinctes, accessibles avec le **seul** JWT — pas besoin de déverrouiller le coffre E2EE pour ces réglages.

Extension / mobile : **même ordre** — connexion compte (JWT), sonde `GET /pass/vaults`, puis écran **initialisation** (liste vide) ou **déverrouillage** ; extension MV3 : tokens en `chrome.storage.session`, maître uniquement en RAM du service worker.

---

## 2. Primitives retenues

| Rôle | Primitive | Détail |
|------|-----------|--------|
| **AEAD (contenu d’item)** | **XChaCha20-Poly1305** | nonce **192 bits** (random) ; AAD = en-tête `header_v1` (cf. § 4). Alternative équivalente : **AES-256-GCM**. Les deux sont **PQ-safe** (Grover ⇒ ≈128 bits). |
| **KDF (mot de passe maître → clé maître)** | **Argon2id** | paramètres **dérivés du device** (cf. § 3.3) ; sortie **32 bytes**. |
| **Dérivation de sous-clés** | **HKDF-SHA-256** | du *master key* vers les clés *vault* / *item-key encryption key* / *MAC*. |
| **KEM hybride** (encapsulation de la clé d’enveloppe) | **X25519 + ML-KEM-768** | concaténation des deux secrets partagés → HKDF → clé d’enveloppe AES-256-GCM. **ML-KEM-768** = niveau 3 NIST (~AES-192 PQ). |
| **Signature (option, partage v3)** | **Ed25519 + ML-DSA-65** (hybride) | non requise en v1 (coffre personnel). |
| **Hash / digest** | **SHA-256** ou **BLAKE2s-256** | identifiants, intégrité d’en-tête. |
| **CSPRNG** | OS (`getrandom`, `SecRandomCopyBytes`, `BCryptGenRandom`) | jamais `Math.random` ni `rand` non cryptographique. |

**Pourquoi ce choix** :
- **XChaCha20-Poly1305** plutôt que AES-256-GCM dans la v1 : nonce 192 bits **aléatoire** sans risque de collision (utile sur mobile où on chiffre des **millions** d’items au cours de la vie d’un coffre, et où l’on veut un *re-chiffrement* idempotent).
- **Hybride X25519 + ML-KEM-768** plutôt que ML-KEM seul : tant que les implémentations PQ ne sont pas auditées sur la durée, on garde une **couche classique** parallèle ; la confidentialité tient si **au moins une** des deux résiste.
- **Argon2id** plutôt que PBKDF2 ou scrypt : déjà standard dans `auth-service` (cohérence) ; meilleur compromis mémoire+CPU contre GPU/ASIC.

---

## 3. Hiérarchie des clés

```
Mot de passe maître utilisateur  ──Argon2id(salt_user, params)──►  MK   (32 bytes)
                                                                   │
                            ┌────HKDF-SHA-256("cloudity-pass/v1/vault-key", info=vault_id)──────►  VK    (32 bytes)
                            │
                            ├────HKDF-SHA-256("cloudity-pass/v1/wrap-key",  info=vault_id)──────►  WK    (32 bytes)
                            │
                            └────HKDF-SHA-256("cloudity-pass/v1/index-key", info=vault_id)──────►  IK    (32 bytes, optionnel)
```

- **MK** : *master key* — **jamais persistée** côté serveur ni en clair côté client (uniquement en mémoire d’une session déverrouillée).  
- **VK** : *vault key* — clé symétrique **utilisée pour chiffrer les `item_key`** et la métadonnée du vault (label, icône). Conservée en mémoire pendant la session.  
- **WK** : *wrap key* — utilisée pour le **scellage hybride** vers les autres appareils (cf. § 5).  
- **IK** : *index key* (Phase 2, recherche locale chiffrée) — clé de **dérivation HMAC-SHA-256** pour produire des *blind tokens* à partir de mots-clés ; **jamais** envoyée au serveur.

### 3.1 Clé d’item (rotation par item)

Pour chaque **item** (login, secure note, carte…), on génère une **clé fraîche** à la **création** et à chaque **modification** majeure :

```
IK_item ← random(32 bytes, CSPRNG)
ciphertext_item ← XChaCha20-Poly1305(key=IK_item, nonce=random(24), aad=header_v1, plaintext=item_json)
wrap_item        ← XChaCha20-Poly1305(key=VK,      nonce=random(24), aad=header_wrap_v1, plaintext=IK_item)
```

**Pourquoi par item** : compromission ou rotation d’un seul item ne force pas à re-chiffrer tout le coffre ; export sélectif possible.

### 3.2 Salts

| Salt | Source | Stocké où | Visible serveur ? |
|------|--------|-----------|---------------------|
| `salt_user` (Argon2id) | `random(16 bytes)` à la création du compte | côté serveur sur `pass_users` | **Oui** (un salt n’est pas un secret). |
| `nonce_*` (XChaCha) | `random(24 bytes)` | dans le ciphertext | **Oui**. |
| `salt_wrap` (re-cle vers appareils) | `random(32 bytes)` par enrôlement | dans le scellage `wrap_device` | **Oui**. |

**Règle** : tous les salts sont générés côté **client** avec le CSPRNG OS, et **uniques par enregistrement**.

### 3.3 Paramètres Argon2id

Choisis **côté client** au premier déverrouillage et **stockés en clair** dans le profil (le serveur ne peut rien en faire sans le mot de passe). Recommandation v1 :

| Profil device | `time` (`t`) | `memory` | `parallelism` |
|---------------|-------------|----------|----------------|
| Desktop / serveur (≥ 8 cœurs, ≥ 8 GiB RAM libre) | 4 | **256 MiB** | 4 |
| Mobile haut de gamme | 3 | **128 MiB** | 2 |
| Mobile entrée de gamme / web fallback | 3 | **64 MiB** | 2 |

Les paramètres sont **vérifiés à chaque ouverture** ; si l’app détecte qu’elle peut tenir un palier supérieur, elle propose un **upgrade silencieux** (re-dérivation à la prochaine modification du mot de passe maître).

---

## 4. Format binaire du blob `ciphertext` (item)

Tout est encodé en **CBOR** (RFC 8949) puis **base64-url** sans padding pour le stockage `pass_items.ciphertext` (chaîne UTF-8 transportable).

```
EnvelopeV1 = {
  "v":         1,                              // version format
  "alg":       "xchacha20poly1305",            // ou "aes256gcm"
  "kdf":       { "name": "argon2id", "t": 4, "m": 262144, "p": 4 },
  "kem":       "x25519+ml-kem-768" (optionnel, présent si l'item est partageable),
  "salt_user": <16 bytes>,                     // copié pour autocontenance offline
  "vault_id":  <UUID v4>,
  "item_id":   <UUID v4>,
  "wrap":      <bytes>,                        // IK_item chiffré sous VK
  "ct":        <bytes>,                        // payload chiffré sous IK_item
  "nonce_w":   <24 bytes>,
  "nonce_c":   <24 bytes>,
  "aad":       <bytes>                         // header canonique signé en AEAD
}
```

- **AAD** (`aad`) inclut le **`item_id` + `vault_id` + `v` + `alg`** sérialisés canoniquement → empêche la **réutilisation cross-item** d’un ciphertext.
- **`v: 1`** : tout changement de format **incrémente** la version ; le client doit savoir lire **tous** les formats antérieurs (compatibilité descendante).
- Le **JSON en clair** (avant chiffrement) est lui-même **versionné** :
  ```json
  {
    "schema": 1,
    "type": "login" | "note" | "card" | "totp" | "ssh-key" | "...",
    "fields": {...}
  }
  ```

---

## 5. Scellage hybride pour les autres appareils (enrôlement)

Quand un utilisateur **enrôle un nouvel appareil** (téléphone), il faut transmettre la **VK** (et la MK indirectement) sans la divulguer au serveur. On utilise un **KEM hybride** :

1. **Nouvel appareil** (Bob) génère une **paire X25519** `(sk_x, pk_x)` et une **paire ML-KEM-768** `(sk_m, pk_m)`. Affichage QR / saisie courte : `pk_x || pk_m` + checksum.
2. **Appareil source** (Alice, déjà déverrouillé) :
   - calcule `ss_x ← X25519(sk_alice_eph, pk_x)` (clé éphémère pour **forward secrecy**).
   - calcule `ss_m, ct_m ← ML-KEM-768.Encaps(pk_m)`.
   - `K_wrap ← HKDF-SHA-256(salt=H(ct_m||pk_x), info="cloudity-pass/v1/enroll", ikm=ss_x || ss_m)`.
   - chiffre **VK + paramètres Argon2id + dictionnaire d’items récents** sous `K_wrap` en **AES-256-GCM**.
3. **Bob** reçoit `(pk_alice_eph, ct_m, ciphertext_enroll)` ; reconstitue `ss_x`, `ss_m`, `K_wrap` ; déchiffre.

**Propriétés** :
- **Hybride** : un attaquant doit casser **X25519 ET ML-KEM-768** pour récupérer la VK.  
- **Forward secrecy** côté Alice grâce à la clé éphémère X25519.  
- **Pas de clé long-terme PQ** côté Alice : ML-KEM est utilisée **uniquement** comme KEM côté Bob → moins de surface si une clé fuit sur Alice.

---

## 6. Rotation et révocation

| Évènement | Action |
|-----------|--------|
| **Changement de mot de passe maître** | nouveau `salt_user` + nouveau `MK` ; **VK reste identique** (re-chiffrement du wrap de VK uniquement) → pas de re-write de millions d’items. |
| **Compromission d’un appareil** | révoquer son enrôlement (liste des `device_id` au serveur), forcer **rotation de VK** ; chaque item voit son `wrap_item` re-chiffré sous la nouvelle VK ; `ct` reste tel quel (clé d’item non exposée au device compromis si déjà sortie). En cas de doute, **re-générer** `IK_item` sur les items sensibles (re-chiffrer le contenu). |
| **Mise à niveau cryptographique** (`v: 2`) | les nouveaux items utilisent `v: 2` ; les anciens sont **lazy-migrated** à la prochaine ouverture/écriture. |
| **Suppression d’item** | soft-delete côté serveur (corbeille 30 j) ; les blobs `ciphertext` peuvent être **purgés** physiquement après TTL (zéro-access ⇒ rien à anonymiser). |

---

## 7. Côté serveur (`backend/passwords-service`)

Le serveur **ne doit pas** savoir :
- déchiffrer le contenu d’un item ;
- distinguer deux items par leur **type** (login / note / carte) — le `type` vit dans le **plaintext**.

Le serveur **doit** savoir :
- l’**utilisateur** propriétaire (auth JWT classique).  
- l’**ID** du vault et de l’item.  
- la **taille** et la **date** des ciphertext (pour quotas / sync).  
- une **étiquette de version de format** (`v: 1`, `v: 2` …) en clair pour permettre l’audit (« combien d’items en `v: 1` à migrer »).

### 7.1 Endpoints actuels

| Méthode + chemin | Rôle | Notes |
|------------------|------|-------|
| `POST /pass/vaults/:id/items` | client | accepte `format_version` (défaut **`currentFormatVersion = 1`**, borné `[0..32767]`). |
| `PUT /pass/items/:id` | client | idem ; renvoie la `format_version` enregistrée. |
| `GET /pass/vaults/:id/items` | client | liste avec `format_version` par item. |
| **`GET /pass/admin/format-versions`** | **admin** | distribution `format_version → count` pour piloter la migration. Source : fonction Postgres `pass_format_version_stats()` **`SECURITY DEFINER`** (count uniquement, jamais le ciphertext). Garde double : rôle admin **côté gateway** + en-tête `X-Admin-Role: admin` revérifié **côté service**. |

Endpoint actuel `pass_items` :

```168:209:backend/passwords-service/main.go
		SELECT id, vault_id, ciphertext, created_at::text, COALESCE(updated_at::text, '')
		// ...
	}{}
	if err := c.ShouldBindJSON(&body); err != nil || body.Ciphertext == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ciphertext required"})
		return
	}
	err = db.QueryRow(`
		INSERT INTO pass_items (vault_id, ciphertext)
		VALUES ($1, $2)
		RETURNING id
	`, vid, body.Ciphertext).Scan(&id)
```

**Évolution v1 minimale** (pas de breaking) : le client envoie déjà le blob CBOR base64-url ; il suffit que le serveur **n’ouvre jamais** ce blob, ce qui est déjà le cas.

**Évolution v2** (suggestion) :
- ajouter une **colonne `format_version SMALLINT`** dans `pass_items` (lecture du header `v:`) — utile pour les rapports admin ; jamais nécessaire au déchiffrement.  
- ajouter `pass_devices` (id, label, dernier IP/user-agent, **`enrollment_pk`** = `pk_x || pk_m`, `revoked_at`) pour gérer la révocation d’appareil sans toucher aux items.

---

## 8. Tests à écrire (résumé)

- **Vecteurs de test** (TS + Dart) qui vérifient l’interopérabilité entre **web** et **mobile** sur un même `EnvelopeV1`.  
- **Round-trip** : chiffrement → ciphertext → déchiffrement, comparé au plaintext.  
- **Manipulation détectée** : flip d’un bit dans `ct`, dans `wrap`, dans `aad` ⇒ erreur AEAD.  
- **KDF performances** : un test mesure le **temps Argon2id** pour les 3 profils (desktop / mobile haut / mobile bas) et tague un **`xfail`** si le device est trop lent (palier au profil inférieur).  
- **Enrollment** : Alice ↔ Bob avec QR fictif ⇒ Bob retrouve VK ; tampering sur `ct_m` ou `pk_x` ⇒ erreur.  
- **Migration v1 → v2** : un item `v: 1` est lu, ré-écrit en `v: 2`, et reste lisible.

---

## 9. Roadmap implémentation (alignée SECURITE.md § 8.3)

| Phase | Livrable | Brique |
|-------|----------|--------|
| **v0.1 (PoC client)** | Client Flutter Pass : **Argon2id + XChaCha20-Poly1305 + VK/IK_item**, sans hybride PQ. Format **`EnvelopeV1`** complet (clé `kem` non utilisée). | Sans dépendance PQ. |
| **v0.2** | Enrôlement multi-device **hybride X25519 + ML-KEM-768**. | Lib PQ : Go = `circl/kem/mlkem` (Cloudflare) ; Dart = `pqcrypto_dart` ou binding `liboqs` ; TS/Web = `@noble/post-quantum`. |
| **v1.0** | Recherche locale chiffrée (IK + tokens HMAC) ; export OPVault-like ; CLI admin (statut formats). | Phase 2 SECURITE. |
| **v2.0** | Partage E2EE (groupes), signatures hybrides **Ed25519 + ML-DSA-65**. | Phase 3 SECURITE. |

---

## 10. Anti-patterns à interdire

- ❌ **Chiffrer côté serveur** un mot de passe « pour la commodité » : casse la garantie zero-access.  
- ❌ **PBKDF2-SHA1** ou **MD5** : non, jamais. **Argon2id** uniquement.  
- ❌ Réutiliser un **nonce** AEAD : utiliser le CSPRNG **à chaque** chiffrement, ou un compteur strictement monotone par clé.  
- ❌ Concaténer secrets sans **HKDF** : passer obligatoirement par HKDF-SHA-256 entre niveaux de clés.  
- ❌ Stocker la **MK** (master key) sur disque, même chiffrée par l’OS keystore, sans **biométrie / déverrouillage explicite** : voir SECURITE-DONNEES § long terme.  
- ❌ Implémenter sa propre primitive : **toujours** une lib auditée (libsodium / `crypto/cipher` Go / `webcrypto` standard / `circl` / `liboqs`).

---

## 11. Liens

- **[SECURITE.md](SECURITE.md)** § 8 — vision PQ globale.  
- **[STATUS.md](../../STATUS.md)** § 2.3 — tableau d’algos + cible PQ par couche.  
- **[SECURITE-DONNEES.md](SECURITE-DONNEES.md)** — état actuel + pistes priorisées.  
- **[ROADMAP.md](../produit/ROADMAP.md)** — fiche **APP-04 Pass** (livraison produit).  
- **[MOBILES.md](../produit/MOBILES.md)** — pendant Flutter du client Pass.

*Document à figer **avant** la première migration publique du Vault Pass. Toute modification du format = bump de `v:` + plan de migration lazy.*
