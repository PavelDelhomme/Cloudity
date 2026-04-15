-- En-têtes MIME bruts (bloc avant la première ligne vide du RFC822) pour affichage diagnostic côté client.
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS raw_headers TEXT;
