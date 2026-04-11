-- Calendriers utilisateur (style Google : plusieurs agendas) + liaison événements

CREATE TABLE IF NOT EXISTS user_calendars (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL DEFAULT 'Mon agenda',
    color_hex VARCHAR(7) NOT NULL DEFAULT '#1a73e8',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_calendars_user ON user_calendars(user_id);

ALTER TABLE user_calendars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_calendars_user_isolation ON user_calendars;
CREATE POLICY user_calendars_user_isolation ON user_calendars
    FOR ALL USING (user_id = current_setting('app.current_user_id', true)::INTEGER);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_calendars_updated_at') THEN
    CREATE TRIGGER update_user_calendars_updated_at BEFORE UPDATE ON user_calendars
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_calendars TO cloudity_app;
GRANT USAGE, SELECT ON SEQUENCE user_calendars_id_seq TO cloudity_app;

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS calendar_id INTEGER REFERENCES user_calendars(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id ON calendar_events(calendar_id);

-- Un agenda par utilisateur ayant déjà des événements
INSERT INTO user_calendars (tenant_id, user_id, name, color_hex, sort_order)
SELECT DISTINCT ce.tenant_id, ce.user_id, 'Mon agenda', '#1a73e8', 0
FROM calendar_events ce
WHERE NOT EXISTS (
  SELECT 1 FROM user_calendars uc WHERE uc.user_id = ce.user_id
);

UPDATE calendar_events e
SET calendar_id = sub.id
FROM (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM user_calendars
  ORDER BY user_id, id ASC
) sub
WHERE e.user_id = sub.user_id AND e.calendar_id IS NULL;
