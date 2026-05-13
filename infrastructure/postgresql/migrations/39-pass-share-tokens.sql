-- 39-pass-share-tokens.sql — Tokens stables pour partage Pass (lien public).
--
-- Modèle "stable share URL" (cf. docs/securite/URL-CAPABILITIES.md § 3) :
--
--   Quand un utilisateur partage un item Pass à un tiers (ex. donner les
--   identifiants Wi-Fi à un colocataire, transmettre un kit d'accueil), il
--   génère un **lien stable** : le token reste valide jusqu'à révocation
--   ou expiration explicite, contrairement aux capability URLs rotatives
--   utilisées pour les pages d'auto-service (cf. `securetoken.go`).
--
--   - Token = 24 octets aléatoires (192 bits) URL-safe → ~33 caractères
--     base64url. Trop large pour être brute-forcé en ligne avec rate-limit.
--   - On ne stocke JAMAIS le token brut en DB → on ne stocke que son hash
--     SHA-256 (`token_hash`). En cas de fuite de la base, l'attaquant ne
--     peut pas reconstruire les tokens.
--   - Le créateur garde la possibilité de révoquer (`revoked_at`) ou
--     d'imposer une expiration (`expires_at`).
--
-- Référence : sprint Pass 2026-05 J7+ (skeleton infra ; UI + endpoints
-- création / révocation seront livrés en L2 / L3 selon roadmap Pass).

CREATE TABLE IF NOT EXISTS pass_share_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identifiant interne (hash SHA-256 du token brut, hex 64 chars).
    -- UNIQUE empêche deux tokens identiques (collisions improbables sur
    -- 192 bits mais on cadenasse côté schéma).
    token_hash TEXT NOT NULL UNIQUE,

    -- Item partagé. Si NULL → c'est tout le vault qui est partagé (TODO L3 :
    -- contrainte CHECK pour exiger l'un ou l'autre).
    vault_id INTEGER NOT NULL REFERENCES pass_vaults(id) ON DELETE CASCADE,
    item_id  INTEGER     NULL REFERENCES pass_items(id)  ON DELETE CASCADE,

    -- Auteur du partage (= propriétaire historique, pour audit + révocation).
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Métadonnées :
    --   * `expires_at` NULL ⇒ pas d'expiration auto (le créateur DOIT
    --     révoquer manuellement quand le partage n'est plus pertinent).
    --   * `revoked_at` NULL ⇒ token actif. Une fois révoqué, plus aucun
    --     consommateur ne peut récupérer l'item (200 → 410 Gone côté API).
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Compteur d'usages (analytics + détection d'anomalie : un partage qui
    -- explose à 10 000 hits en 1 h est suspect).
    use_count BIGINT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ
);

-- Index recherche rapide par hash (la lookup la plus fréquente côté API
-- "GET /pass/share/:token" hashe le token reçu et fait un SELECT direct).
-- L'UNIQUE ci-dessus en crée un déjà ; on le redéclare pas explicitement.

-- Index partiel sur les tokens actifs : raccourci pour les listes d'audit
-- ("liste mes partages actifs"). `revoked_at IS NULL` filtre les révoqués
-- et `expires_at IS NULL OR expires_at > now()` les non-expirés (à exécuter
-- côté requête car `now()` n'est pas IMMUTABLE).
CREATE INDEX IF NOT EXISTS idx_pass_share_tokens_active
    ON pass_share_tokens(created_by, vault_id)
 WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pass_share_tokens_created_by
    ON pass_share_tokens(created_by, created_at DESC);

COMMENT ON TABLE pass_share_tokens IS
'Tokens stables pour partage Pass (cf. docs/securite/URL-CAPABILITIES.md § 3). '
'Hashés SHA-256 ; révocables ; expiration optionnelle. '
'À distinguer des capability URLs rotatives (securetoken.go) qui servent à l''auto-service du user.';
