-- Pilotage projet (style JobbingTrack) — board unique JSONB pour /4dm1n/pilotage

CREATE TABLE IF NOT EXISTS cloudity_pilotage_board (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS cloudity_pilotage_events (
    id BIGSERIAL PRIMARY KEY,
    task_id TEXT NOT NULL,
    action TEXT NOT NULL,
    decision TEXT,
    note TEXT,
    actor_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cloudity_pilotage_events_created
    ON cloudity_pilotage_events (created_at DESC);

COMMENT ON TABLE cloudity_pilotage_board IS
    'État interactif du tableau de suivi projet (cycles, tâches, checklists) — back-office /4dm1n/pilotage.';
COMMENT ON TABLE cloudity_pilotage_events IS
    'Historique des décisions / actions pilotage (audit léger).';
