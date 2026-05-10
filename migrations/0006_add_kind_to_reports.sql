-- Distinguish funnel-generated reports from wizard-saved reports.
-- /r listing filters to kind='wizard'; funnel reports rendered via /report/{seg}/:id.

ALTER TABLE reports ADD COLUMN kind TEXT NOT NULL DEFAULT 'wizard';

CREATE INDEX IF NOT EXISTS idx_reports_kind ON reports(kind);
