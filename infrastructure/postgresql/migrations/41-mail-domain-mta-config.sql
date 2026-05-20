-- MAIL-ALIAS-05 : configuration MTA/DNS par domaine mail (admin).
-- Valeurs opérationnelles réelles (FQDN/IP/secrets) restent hors Git ; ces colonnes
-- servent à piloter et auditer l'état attendu depuis /4dm1n/domaines.

ALTER TABLE mail_domains
    ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'standard',
    ADD COLUMN IF NOT EXISTS mta_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS mta_provider VARCHAR(64) NOT NULL DEFAULT 'maddy',
    ADD COLUMN IF NOT EXISTS mta_hostname VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS mx_target VARCHAR(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS spf_policy TEXT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS dkim_selector VARCHAR(128) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS dmarc_policy VARCHAR(64) DEFAULT NULL;

COMMENT ON COLUMN mail_domains.role IS
    'standard = domaine annuaire ; alias = domaine de réception alias MTA';
COMMENT ON COLUMN mail_domains.mta_enabled IS
    'Si true, le domaine est prévu pour réception MTA Cloudity (MX vers mail.<domaine>).';
COMMENT ON COLUMN mail_domains.mta_hostname IS
    'Hostname MTA attendu (ex. mail.<domaine>) ; ne pas stocker d’IP secrète.';
COMMENT ON COLUMN mail_domains.mx_target IS
    'Cible MX attendue, généralement mail.<domaine>.';
COMMENT ON COLUMN mail_domains.spf_policy IS
    'Politique SPF attendue (placeholder/valeur publique DNS).';
COMMENT ON COLUMN mail_domains.dkim_selector IS
    'Sélecteur DKIM attendu, clé privée hors base/Git.';
COMMENT ON COLUMN mail_domains.dmarc_policy IS
    'Politique DMARC progressive : none, quarantine, reject.';

UPDATE mail_domains
SET dkim_selector = COALESCE(NULLIF(TRIM(dkim_selector), ''), 'cloudity'),
    dmarc_policy = COALESCE(NULLIF(TRIM(dmarc_policy), ''), 'none')
WHERE dkim_selector IS NULL OR dmarc_policy IS NULL;
