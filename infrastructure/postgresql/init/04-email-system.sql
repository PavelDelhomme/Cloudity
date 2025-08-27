-- Extension pour UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tables pour le système email
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    type VARCHAR(50) DEFAULT 'custom', -- inbox, sent, drafts, trash, spam, custom
    icon VARCHAR(50),
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_id VARCHAR(255) UNIQUE,
    thread_id UUID,
    subject TEXT,
    from_address VARCHAR(255) NOT NULL,
    from_name VARCHAR(255),
    to_addresses JSONB NOT NULL,
    cc_addresses JSONB,
    bcc_addresses JSONB,
    reply_to VARCHAR(255),
    body_text TEXT,
    body_html TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    folder_id UUID REFERENCES folders(id),
    labels JSONB DEFAULT '[]'::jsonb,
    is_read BOOLEAN DEFAULT false,
    is_starred BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    is_spam BOOLEAN DEFAULT false,
    is_important BOOLEAN DEFAULT false,
    priority INTEGER DEFAULT 3, -- 1=high, 3=normal, 5=low
    size_bytes INTEGER DEFAULT 0,
    encrypted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    source_email VARCHAR(255) UNIQUE NOT NULL,
    destination_email VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL DEFAULT 'alias.delhomme.ovh',
    alias_type VARCHAR(50) DEFAULT 'random', -- random, thematic, temporary, sequential
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    max_usage INTEGER,
    expires_at TIMESTAMP,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT,
    to_addresses JSONB,
    cc_addresses JSONB,
    bcc_addresses JSONB,
    body_text TEXT,
    body_html TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    scheduled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX idx_emails_user_folder ON emails(user_id, folder_id);
CREATE INDEX idx_emails_thread ON emails(thread_id);
CREATE INDEX idx_emails_created ON emails(created_at DESC);
CREATE INDEX idx_aliases_source ON email_aliases(source_email);
CREATE INDEX idx_aliases_user ON email_aliases(user_id) WHERE is_active = true;

-- Dossiers par défaut pour chaque utilisateur
CREATE OR REPLACE FUNCTION create_default_folders()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO folders (tenant_id, user_id, name, type, icon, sort_order) VALUES
    (NEW.tenant_id, NEW.id, 'Inbox', 'inbox', 'inbox', 1),
    (NEW.tenant_id, NEW.id, 'Sent', 'sent', 'send', 2),
    (NEW.tenant_id, NEW.id, 'Drafts', 'drafts', 'draft', 3),
    (NEW.tenant_id, NEW.id, 'Trash', 'trash', 'delete', 4),
    (NEW.tenant_id, NEW.id, 'Spam', 'spam', 'report', 5),
    (NEW.tenant_id, NEW.id, 'Archive', 'archive', 'archive', 6);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour créer les dossiers par défaut
DROP TRIGGER IF EXISTS create_default_folders_trigger ON users;
CREATE TRIGGER create_default_folders_trigger
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_folders();