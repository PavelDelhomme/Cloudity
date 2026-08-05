-- APP-08 : fiche contact riche (profil JSONB Google Contacts-like)
-- name / email / phone restent dénormalisés (recherche, Mail, import).

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE contacts
  ALTER COLUMN email SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_contacts_profile_gin ON contacts USING GIN (profile);

COMMENT ON COLUMN contacts.profile IS
  'Champs riches : given_name, family_name, phones[{label,value,country}], emails[], addresses[], websites[], relations[], notes, org, …';
