-- Make payload nullable so R2-backed rows don't need to carry a D1 copy.
-- SQLite doesn't support ALTER COLUMN, so we recreate the table.
PRAGMA foreign_keys = OFF;

CREATE TABLE reports_new (
  id             TEXT    PRIMARY KEY,
  name           TEXT,
  owner_id       TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  payload        TEXT,
  locked         INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

INSERT INTO reports_new
  SELECT id, name, owner_id, schema_version, payload, locked, created_at
  FROM reports;

DROP TABLE reports;
ALTER TABLE reports_new RENAME TO reports;

PRAGMA foreign_keys = ON;
