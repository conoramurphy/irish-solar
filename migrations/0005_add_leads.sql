-- Lead capture for the Watt Profit ads funnel.
-- One row per submission from /hotels, /dairy, or the root-landing chooser.
-- segment='other' rows do not have a personalised report; report_id is null.

CREATE TABLE IF NOT EXISTS leads (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  eircode          TEXT NOT NULL,
  phone_e164       TEXT NOT NULL,
  annual_spend_eur INTEGER NOT NULL,
  segment          TEXT NOT NULL CHECK (segment IN ('hotel','dairy','other')),
  business_type    TEXT,
  report_id        TEXT,
  created_at       INTEGER NOT NULL,
  FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_segment ON leads(segment);
