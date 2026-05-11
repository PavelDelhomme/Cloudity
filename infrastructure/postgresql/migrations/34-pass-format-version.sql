-- Migration : pass_items.format_version
--
-- Suit la spec docs/securite/PASS-CRYPTO.md : on étiquette chaque ciphertext avec la
-- version du format d'enveloppe utilisée par le client (1 = EnvelopeV1 :
-- Argon2id + XChaCha20-Poly1305 + KEM hybride X25519 ⊕ ML-KEM-768).
--
-- Le serveur n'ouvre PAS le blob ; cette colonne sert uniquement à :
--   - savoir combien d'items restent à migrer (`SELECT format_version, COUNT(*) FROM pass_items GROUP BY 1`);
--   - bloquer un client trop ancien si on supprime un format obsolète plus tard.
--
-- 0 = format inconnu (legacy, blob avant intro de la version) — à migrer.
-- 1 = EnvelopeV1 (cible v1).
-- 2+ = futurs formats (bumps à documenter dans PASS-CRYPTO.md § 9).

ALTER TABLE pass_items
    ADD COLUMN IF NOT EXISTS format_version SMALLINT NOT NULL DEFAULT 0;

-- Les lignes pré-existantes restent à 0 → migration lazy côté client.
COMMENT ON COLUMN pass_items.format_version IS
    'Version d''enveloppe Pass-Crypto déclarée par le client (0 = legacy, 1 = EnvelopeV1, voir docs/securite/PASS-CRYPTO.md).';

CREATE INDEX IF NOT EXISTS idx_pass_items_format_version
    ON pass_items (format_version);
