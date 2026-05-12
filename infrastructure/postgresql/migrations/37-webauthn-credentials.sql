-- 37-webauthn-credentials.sql — Stockage des credentials WebAuthn / passkeys.
-- Phase W1 (Q17=A) : enregistrement limité aux comptes `role = 'admin'`,
-- vérifié côté handler (cf. backend/auth-service/webauthn.go).
--
-- Table conçue pour respecter la spec W3C WebAuthn L3 :
--   - `credential_id`  : bytea (longueur variable 16-1023 selon authenticator)
--   - `public_key`     : COSE encoded public key (pas de format imposé en SQL,
--                        c'est la lib `go-webauthn/webauthn` qui parse)
--   - `sign_count`     : compteur monotone strict (replay protection)
--   - `aaguid`         : identifie le modèle d'authenticator (utile pour stats)
--   - `transports`     : jsonb (ex. ["usb","nfc","ble"])
--   - `attestation_fmt` : enum ('none','packed','tpm','android-key','android-safetynet','fido-u2f','apple','fido-u2f-bytes')
--
-- Voir docs/securite/WEBAUTHN-PLAN.md § 2 (Phase W1).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         INT         NOT NULL,
    credential_id   BYTEA       NOT NULL,
    public_key      BYTEA       NOT NULL,
    sign_count      BIGINT      NOT NULL DEFAULT 0 CHECK (sign_count >= 0),
    aaguid          BYTEA,
    transports      JSONB       NOT NULL DEFAULT '[]'::jsonb,
    attestation_fmt TEXT        NOT NULL DEFAULT 'none',
    nickname        TEXT        NOT NULL DEFAULT 'passkey',
    backup_eligible BOOLEAN     NOT NULL DEFAULT FALSE,
    backup_state    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ,

    CONSTRAINT webauthn_credentials_user_fk
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    -- credential_id doit être unique GLOBALEMENT (spec WebAuthn) — pas seulement par user.
    CONSTRAINT webauthn_credentials_credential_id_unique UNIQUE (credential_id)
);

CREATE INDEX IF NOT EXISTS webauthn_credentials_user_id_idx
    ON webauthn_credentials (user_id);
