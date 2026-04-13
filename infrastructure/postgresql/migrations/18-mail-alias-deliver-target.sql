-- Cible de livraison documentée pour un alias utilisateur (Pass, transfert, notes produit).
-- Les messages continuent d’être lus via IMAP sur user_email_accounts ; ce champ sert à l’UX et aux intégrations (extension Pass, règles futures).

ALTER TABLE user_email_aliases
  ADD COLUMN IF NOT EXISTS deliver_target_email VARCHAR(512) DEFAULT NULL;

COMMENT ON COLUMN user_email_aliases.deliver_target_email IS
  'Adresse ou description de routage souhaité (ex. boîte réelle, forward). Non appliqué automatiquement par Cloudity tant que le fournisseur / DNS n’est pas configuré.';
