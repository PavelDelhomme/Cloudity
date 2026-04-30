-- Critère domaine expéditeur (distinct du motif « from contient »).
ALTER TABLE mail_filter_rules ADD COLUMN IF NOT EXISTS from_domain_pattern TEXT NOT NULL DEFAULT '';
