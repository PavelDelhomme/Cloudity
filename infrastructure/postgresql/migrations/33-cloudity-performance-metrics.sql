-- Historique des snapshots runtime (admin) et rapports de pipelines (make test, E2E, mobile, etc.)

CREATE TABLE IF NOT EXISTS cloudity_performance_snapshots (
    id BIGSERIAL PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL,
    payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloudity_perf_snapshots_recorded_at
    ON cloudity_performance_snapshots (recorded_at DESC);

CREATE TABLE IF NOT EXISTS cloudity_performance_pipeline_runs (
    id BIGSERIAL PRIMARY KEY,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    pipeline_kind TEXT NOT NULL,
    run_id TEXT,
    success BOOLEAN,
    duration_ms INTEGER,
    cpu_pct_max DOUBLE PRECISION,
    mem_peak_mb DOUBLE PRECISION,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cloudity_perf_pipeline_kind_time
    ON cloudity_performance_pipeline_runs (pipeline_kind, recorded_at DESC);
