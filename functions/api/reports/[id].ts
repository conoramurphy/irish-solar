interface Env {
  DB: D1Database;
  REPORTS_BUCKET?: R2Bucket;
  ALLOWED_ORIGINS?: string;
}

interface ReportRow {
  id: string;
  name: string | null;
  schema_version: number;
  payload: string | null;
  locked: number;
  created_at: number;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };
  const id = params.id as string;

  const row = await env.DB.prepare(
    'SELECT id, name, schema_version, payload, locked, created_at FROM reports WHERE id = ?'
  )
    .bind(id)
    .first<ReportRow>();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Report not found' }), { status: 404, headers });
  }

  // Resolve payload: R2 first (new records), D1 payload column as fallback (old records)
  let payloadJson: string | null = null;

  if (env.REPORTS_BUCKET) {
    const obj = await env.REPORTS_BUCKET.get(`reports/${id}.json`);
    if (obj) {
      payloadJson = await obj.text();
    }
  }

  if (!payloadJson) {
    payloadJson = row.payload;
  }

  if (!payloadJson) {
    return new Response(JSON.stringify({ error: 'Report payload not found' }), { status: 404, headers });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return new Response(JSON.stringify({ error: 'Corrupt report payload' }), { status: 500, headers });
  }

  return new Response(
    JSON.stringify({
      id: row.id,
      name: row.name,
      schemaVersion: row.schema_version,
      locked: row.locked === 1,
      payload,
      createdAt: row.created_at,
    }),
    { status: 200, headers }
  );
};

// PATCH /api/reports/:id — toggle locked state (admin only, guarded by ?mode=admin in the UI)
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, params }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };
  const id = params.id as string;

  let body: { locked?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  if (typeof body.locked !== 'boolean') {
    return new Response(JSON.stringify({ error: 'locked must be a boolean' }), { status: 400, headers });
  }

  const result = await env.DB.prepare(
    'UPDATE reports SET locked = ? WHERE id = ?'
  )
    .bind(body.locked ? 1 : 0, id)
    .run();

  if (result.meta.changes === 0) {
    return new Response(JSON.stringify({ error: 'Report not found' }), { status: 404, headers });
  }

  return new Response(JSON.stringify({ id, locked: body.locked }), { status: 200, headers });
};
