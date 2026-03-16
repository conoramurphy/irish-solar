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
