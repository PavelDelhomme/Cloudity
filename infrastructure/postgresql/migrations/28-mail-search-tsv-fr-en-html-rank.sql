-- Recherche mail v2 : HTML léger (strip tags), lemmatisation FR + EN, tri par pertinence (ts_rank_cd).
-- Remplace la colonne search_tsv de la migration 27.

CREATE OR REPLACE FUNCTION mail_strip_html_for_tsv(html text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN html IS NULL OR btrim(html) = '' THEN ''
    ELSE left(
      trim(
        both ' ' FROM regexp_replace(
          regexp_replace(
            replace(replace(replace(replace(html, '&nbsp;', ' '), '&#160;', ' '), '&amp;', '&'), '&lt;', '<'),
            '<[^>]*>',
            ' ',
            'gi'
          ),
          '\s+',
          ' ',
          'g'
        )
      ),
      35000
    )
  END;
$fn$;

CREATE OR REPLACE FUNCTION mail_search_index_blob(
  p_subject text,
  p_from text,
  p_to text,
  p_plain text,
  p_html text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT left(
    coalesce(p_subject, '') || ' ' ||
    coalesce(p_from, '') || ' ' ||
    coalesce(p_to, '') || ' ' ||
    coalesce(left(p_plain, 70000), '') || ' ' ||
    coalesce(mail_strip_html_for_tsv(p_html), ''),
    105000
  );
$fn$;

CREATE OR REPLACE FUNCTION mail_row_to_search_tsv(
  p_subject text,
  p_from text,
  p_to text,
  p_plain text,
  p_html text
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT
    setweight(to_tsvector('french', b.blob), 'A')
    || setweight(to_tsvector('english', b.blob), 'B')
  FROM (SELECT mail_search_index_blob(p_subject, p_from, p_to, p_plain, p_html) AS blob) b;
$fn$;

DROP INDEX IF EXISTS idx_mail_messages_search_tsv;
ALTER TABLE mail_messages DROP COLUMN IF EXISTS search_tsv;

ALTER TABLE mail_messages
ADD COLUMN search_tsv tsvector
GENERATED ALWAYS AS (
  mail_row_to_search_tsv(subject, from_addr, to_addrs, body_plain, body_html)
) STORED;

CREATE INDEX idx_mail_messages_search_tsv ON mail_messages USING GIN (search_tsv);
