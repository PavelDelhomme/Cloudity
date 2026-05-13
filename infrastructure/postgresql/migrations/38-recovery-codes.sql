-- Migration 38 — Codes de récupération 2FA (`recovery_codes`).
--
-- Référence : docs/securite/2FA.md (à créer), docs/produit/SPRINT-PASS-2026-05.md J5.
--
-- Quand un utilisateur active la 2FA TOTP, on génère 10 codes de récupération
-- aléatoires (ex. "K3QV-7PXR-9MFB"). Stockés HASHÉS (bcrypt cost 12) et
-- jamais en clair en base. Le client ne les revoit qu'à la génération
-- (à montrer une seule fois — comme GitHub / Google).
--
-- Usage :
--   1. Activation 2FA → backend génère 10 codes + insère 10 lignes (hash) +
--      retourne les valeurs CLAIRES (UNE FOIS). UI : "Sauvegarde-les
--      maintenant, ils ne réapparaîtront pas."
--   2. Login étape 2 : l'utilisateur peut taper soit son TOTP, soit un code
--      de récup. Si code de récup match (et `used_at IS NULL`), on marque
--      `used_at = now()` et on autorise la connexion.
--   3. Régénération : l'utilisateur peut cliquer "Régénérer" → DELETE des
--      anciens + 10 nouveaux. Aussi déclenché automatiquement quand il ne
--      reste plus que 2 codes valides (UI affiche un avertissement).
--
-- Sécurité :
--  - Hash bcrypt cost 12 (~250 ms par tentative — fait office de rate-limit
--    naturel sur les attaques en ligne).
--  - Index partiel sur `used_at IS NULL` pour ne lookuper que les codes
--    valides au login (perf : 10 lignes max par user).
--  - ON DELETE CASCADE depuis users : supprimer un compte purge les codes.

CREATE TABLE IF NOT EXISTS recovery_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash   TEXT NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup au login étape 2 : on récupère uniquement les codes encore valides
-- de l'user, on bcrypt-compare le code saisi contre chaque code_hash.
-- Limité à 10 lignes max par user → linéaire acceptable.
CREATE INDEX IF NOT EXISTS recovery_codes_user_active_idx
    ON recovery_codes (user_id) WHERE used_at IS NULL;

-- Audit : retrouver quand un code a été consommé (forensic en cas
-- d'incident).
CREATE INDEX IF NOT EXISTS recovery_codes_used_idx
    ON recovery_codes (used_at) WHERE used_at IS NOT NULL;

COMMENT ON TABLE recovery_codes IS
    'Codes de récupération 2FA (10/user). Hashés bcrypt cost 12. Usage unique (used_at).';
COMMENT ON COLUMN recovery_codes.code_hash IS
    'Hash bcrypt cost 12 du code en clair (jamais stocké). Le code clair n''est montré qu''à la génération.';
COMMENT ON COLUMN recovery_codes.used_at IS
    'NULL = code disponible. Set au moment de la consommation (login étape 2 avec code de récup) — usage unique.';
