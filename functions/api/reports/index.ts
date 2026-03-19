import { nanoid } from 'nanoid';

interface Env {
  DB: D1Database;
  REPORTS_BUCKET?: R2Bucket;
  ALLOWED_ORIGINS?: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };

  const { results } = await env.DB.prepare(
    'SELECT id, name, description, locked, created_at FROM reports ORDER BY created_at DESC'
  ).all<{ id: string; name: string | null; description: string | null; locked: number; created_at: number }>();

  const reports = (results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    locked: r.locked === 1,
    createdAt: r.created_at,
  }));

  return new Response(JSON.stringify(reports), { status: 200, headers });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };

  let body: { name?: string; report: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  if (!body.report || typeof body.report !== 'object') {
    return new Response(JSON.stringify({ error: 'Missing report payload' }), { status: 400, headers });
  }

  const id = nanoid();
  const name = typeof body.name === 'string' ? body.name
    : typeof body.report.name === 'string' ? body.report.name
    : null;
  const schemaVersion = typeof body.report.schemaVersion === 'number' ? body.report.schemaVersion : 1;
  const createdAt = Date.now();
  const payloadJson = JSON.stringify(body.report);

  if (env.REPORTS_BUCKET) {
    // Write payload to R2. If the subsequent D1 insert fails, clean up the R2 object
    // so we don't end up with an orphaned payload that can never be retrieved.
    await env.REPORTS_BUCKET.put(`reports/${id}.json`, payloadJson, {
      httpMetadata: { contentType: 'application/json' },
    });
    try {
      await env.DB.prepare(
        'INSERT INTO reports (id, name, schema_version, locked, created_at) VALUES (?, ?, ?, 0, ?)'
      )
        .bind(id, name, schemaVersion, createdAt)
        .run();
    } catch (err) {
      // Rollback: remove the R2 object so it doesn't become an orphan
      await env.REPORTS_BUCKET.delete(`reports/${id}.json`).catch(() => undefined);
      throw err;
    }
  } else {
    // Local dev / environments without R2 — store payload in D1 directly
    await env.DB.prepare(
      'INSERT INTO reports (id, name, schema_version, payload, locked, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    )
      .bind(id, name, schemaVersion, payloadJson, createdAt)
      .run();
  }

  return new Response(JSON.stringify({ id }), { status: 201, headers });
};
