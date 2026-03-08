CREATE TABLE IF NOT EXISTS reports (
  id             TEXT    PRIMARY KEY,
  name           TEXT,
  owner_id       TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload        TEXT    NOT NULL,
  created_at     INTEGER NOT NULL
);
