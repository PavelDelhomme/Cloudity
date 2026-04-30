-- Recherche plein texte indexée (GIN) pour ?q= — remplace les LIKE sur grosses colonnes.
-- Colonne stockée : recalculée à chaque INSERT/UPDATE de mail_messages (PG 12+).

ALTER TABLE mail_messages
ADD COLUMN IF NOT EXISTS search_tsv tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(subject, '')), 'A')
  || setweight(to_tsvector('simple', coalesce(from_addr, '')), 'B')
  || setweight(to_tsvector('simple', coalesce(to_addrs, '')), 'B')
  || setweight(to_tsvector('simple', coalesce(left(body_plain, 120000), '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS idx_mail_messages_search_tsv ON mail_messages USING GIN (search_tsv);
