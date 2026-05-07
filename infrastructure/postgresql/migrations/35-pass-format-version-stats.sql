-- Fonction agrégée pass_format_version_stats() — donne le nombre d'items par
-- version d'enveloppe Pass-Crypto (cf. docs/PASS-CRYPTO.md § 9). SERVICE
-- DEFINER + recherche bornée pour pouvoir contourner RLS en lecture seule
-- depuis le password-manager, sans exposer les ciphertext.
--
-- Utilisée par GET /pass/admin/format-versions (réservée aux admins via la
-- gateway, cf. backend/api-gateway/main.go isAdminOnlyPassRoute).

CREATE OR REPLACE FUNCTION pass_format_version_stats()
RETURNS TABLE (
    format_version SMALLINT,
    item_count     BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE(format_version, 0)::SMALLINT AS format_version,
           COUNT(*)::BIGINT                      AS item_count
    FROM pass_items
    GROUP BY 1
    ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION pass_format_version_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pass_format_version_stats() TO cloudity_app;

COMMENT ON FUNCTION pass_format_version_stats() IS
    'Statistiques agrégées par format_version Pass-Crypto. SECURITY DEFINER : contourne RLS pour lecture seule (count uniquement, jamais le ciphertext).';
