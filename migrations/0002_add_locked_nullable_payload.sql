-- Add locked flag for report gating.
-- payload becomes nullable; new reports store payload in R2, not D1.
ALTER TABLE reports ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;

-- SQLite doesn't support DROP COLUMN in older versions, so we leave
-- payload in place. For new rows it will be NULL (we won't insert it).
-- The GET handler reads R2 first and falls back to payload for old rows.
