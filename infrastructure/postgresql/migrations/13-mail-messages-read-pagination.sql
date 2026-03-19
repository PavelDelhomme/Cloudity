-- Lu / non lu et pagination pour mail_messages
ALTER TABLE mail_messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_mail_messages_account_folder_read ON mail_messages(account_id, folder, is_read);
