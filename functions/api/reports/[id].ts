import { computeFunnelPaths, buildPersonalisedReport } from '../../../src/utils/funnelSubmit';
import { parseSolarTimeseriesCSV } from '../../../src/utils/solarTimeseriesParser';
import { FUNNEL_BASELINES } from '../../../src/components/landings/funnelConstants';
import type { SavedReport } from '../../../src/types/savedReports';
import type { CalculationResult } from '../../../src/types';

interface Env {
  DB: D1Database;
  REPORTS_BUCKET?: R2Bucket;
  ALLOWED_ORIGINS?: string;
}

interface ReportRow {
  id: string;
  name: string | null;
  description: string | null;
  schema_version: number;
  payload: string | null;
  locked: number;
  created_at: number;
}

interface LeadRow {
  segment: string;
  annual_spend_eur: number;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Lazy migration: if `parsed` is a stale funnel report (has a leads row but no
 * `hourlyConsumptionOverride` on its persisted result), re-run the engine with
 * the lead's original spend and overwrite the persisted payload.
 *
 * Returns the fresh SavedReport, or null when the report isn't a stale funnel
 * (then the caller serves the existing payload as-is). Never throws — any
 * error here is logged and falls back to serving the stale data.
 *
 * See AGENTS.md "Calculations: re-run the engine, never duplicate" for the
 * rule this implements: if the saved snapshot is older than the engine, the
 * snapshot must be re-derived from inputs, not patched in place.
 */
async function refreshIfStaleFunnel(
  id: string,
  parsed: SavedReport,
  env: Env,
  request: Request
): Promise<SavedReport | null> {
  // Already migrated? Skip.
  if (parsed.hourlyConsumptionOverride && parsed.hourlyConsumptionOverride.length > 0) {
    return null;
  }

  // Lead lookup: only funnel reports have a corresponding leads row, and only
  // those carry the `annualSpendEur` we need to re-run.
  let lead: LeadRow | null;
  try {
    lead = await env.DB.prepare(
      'SELECT segment, annual_spend_eur FROM leads WHERE report_id = ? LIMIT 1'
    )
      .bind(id)
      .first<LeadRow>();
  } catch (err) {
    // Leads table absent (very old dev env) — not a funnel report we can refresh.
    console.warn('refreshIfStaleFunnel: leads lookup failed', err);
    return null;
  }
  if (!lead) return null;
  if (lead.segment !== 'hotel' && lead.segment !== 'dairy') return null;

  try {
    // Pull the segment's baseline payload from R2 (or D1 fallback).
    const baselineId = FUNNEL_BASELINES[lead.segment as 'hotel' | 'dairy'].reportId;
    const baseline = await loadBaselinePayload(baselineId, env);
    if (!baseline) {
      console.warn('refreshIfStaleFunnel: baseline not found', baselineId);
      return null;
    }

    // Solar loader hits the same Pages deployment's static asset path.
    const origin = new URL(request.url).origin;
    const solarLoader = async (location: string, year: number) => {
      const res = await fetch(`${origin}/data/solar/${location}_${year}.csv`);
      if (!res.ok) throw new Error(`Solar CSV fetch failed: ${res.status}`);
      const csv = await res.text();
      return parseSolarTimeseriesCSV(csv, location);
    };

    const {
      paths,
      scaledSensitivity,
      scaleFactor,
      scaledBaselineAnnualBill,
      freshDetailResult,
      scaledHourlyConsumption,
    } = await computeFunnelPaths(baseline, lead.annual_spend_eur, solarLoader);

    const fresh = buildPersonalisedReport(
      baseline,
      scaleFactor,
      scaledSensitivity,
      scaledBaselineAnnualBill,
      paths,
      freshDetailResult,
      scaledHourlyConsumption
    );

    // Preserve the existing report's identity. The persisted payload's
    // computed fields are replaced, but id / createdAt / name (managed via
    // PATCH) stay put.
    const persisted: SavedReport = {
      ...fresh,
      id,
      name: parsed.name ?? fresh.name,
      createdAt: parsed.createdAt,
    };

    const persistedJson = JSON.stringify(persisted);
    if (env.REPORTS_BUCKET) {
      await env.REPORTS_BUCKET.put(`reports/${id}.json`, persistedJson, {
        httpMetadata: { contentType: 'application/json' },
      });
    } else {
      await env.DB.prepare('UPDATE reports SET payload = ? WHERE id = ?')
        .bind(persistedJson, id)
        .run();
    }

    return persisted;
  } catch (err) {
    console.warn('refreshIfStaleFunnel: refresh failed', err);
    return null;
  }
}

async function loadBaselinePayload(
  baselineId: string,
  env: Env
): Promise<SavedReport | null> {
  if (env.REPORTS_BUCKET) {
    const obj = await env.REPORTS_BUCKET.get(`reports/${baselineId}.json`);
    if (obj) {
      const text = await obj.text();
      return JSON.parse(text) as SavedReport;
    }
  }
  const row = await env.DB.prepare('SELECT payload FROM reports WHERE id = ?')
    .bind(baselineId)
    .first<{ payload: string | null }>();
  if (row?.payload) {
    return JSON.parse(row.payload) as SavedReport;
  }
  return null;
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };
  const id = params.id as string;

  const row = await env.DB.prepare(
    'SELECT id, name, description, schema_version, payload, locked, created_at FROM reports WHERE id = ?'
  )
    .bind(id)
    .first<ReportRow>();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Report not found' }), { status: 404, headers });
  }

  // Resolve payload: if row has no D1 payload it's an R2-backed record, fetch from R2.
  // Skip the R2 round-trip for old records that already have a payload in D1.
  let payloadJson: string | null = row.payload;

  if (!payloadJson && env.REPORTS_BUCKET) {
    const obj = await env.REPORTS_BUCKET.get(`reports/${id}.json`);
    if (obj) {
      payloadJson = await obj.text();
    }
  }

  if (!payloadJson) {
    return new Response(JSON.stringify({ error: 'Report payload not found' }), { status: 404, headers });
  }

  let payload: SavedReport;
  try {
    payload = JSON.parse(payloadJson) as SavedReport;
  } catch {
    return new Response(JSON.stringify({ error: 'Corrupt report payload' }), { status: 500, headers });
  }

  // Lazy refresh: if this is a stale funnel report (persisted before today's
  // engine fix), re-render with the current engine and overwrite. First-view
  // pays a one-time cost; subsequent reads serve the fresh payload directly.
  const refreshed = await refreshIfStaleFunnel(id, payload, env, request);
  if (refreshed) {
    payload = refreshed;
  }

  return new Response(
    JSON.stringify({
      id: row.id,
      name: row.name,
      description: row.description,
      schemaVersion: row.schema_version,
      locked: row.locked === 1,
      payload,
      createdAt: row.created_at,
    }),
    { status: 200, headers }
  );
};

// PATCH /api/reports/:id — update name, description, and/or locked state (admin only)
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };
  const id = params.id as string;

  let body: { locked?: boolean; name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  if (body.locked !== undefined && typeof body.locked !== 'boolean') {
    return new Response(JSON.stringify({ error: 'locked must be a boolean' }), { status: 400, headers });
  }
  if (body.name !== undefined && typeof body.name !== 'string') {
    return new Response(JSON.stringify({ error: 'name must be a string' }), { status: 400, headers });
  }
  if (body.description !== undefined && typeof body.description !== 'string') {
    return new Response(JSON.stringify({ error: 'description must be a string' }), { status: 400, headers });
  }

  // Build SET clause dynamically based on which fields are provided
  const sets: string[] = [];
  const binds: (string | number | null)[] = [];

  if (body.locked !== undefined) {
    sets.push('locked = ?');
    binds.push(body.locked ? 1 : 0);
  }
  if (body.name !== undefined) {
    sets.push('name = ?');
    binds.push(body.name.trim() || null);
  }
  if (body.description !== undefined) {
    sets.push('description = ?');
    binds.push(body.description.trim() || null);
  }

  if (sets.length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers });
  }

  binds.push(id);
  const result = await env.DB.prepare(
    `UPDATE reports SET ${sets.join(', ')} WHERE id = ?`
  )
    .bind(...binds)
    .run();

  if (result.meta.changes === 0) {
    return new Response(JSON.stringify({ error: 'Report not found' }), { status: 404, headers });
  }

  return new Response(JSON.stringify({ id, ...body }), { status: 200, headers });
};

// DELETE /api/reports/:id — permanently delete a report
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };
  const id = params.id as string;

  const result = await env.DB.prepare('DELETE FROM reports WHERE id = ?').bind(id).run();

  if (result.meta.changes === 0) {
    return new Response(JSON.stringify({ error: 'Report not found' }), { status: 404, headers });
  }

  // Best-effort R2 cleanup — don't fail the request if R2 delete fails
  if (env.REPORTS_BUCKET) {
    await env.REPORTS_BUCKET.delete(`reports/${id}.json`).catch(() => undefined);
  }

  return new Response(null, { status: 204, headers });
};
