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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
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

  // Write payload to R2 (no 1 MB row limit). Fall back to D1 payload column if R2 not bound.
  if (env.REPORTS_BUCKET) {
    await env.REPORTS_BUCKET.put(`reports/${id}.json`, payloadJson, {
      httpMetadata: { contentType: 'application/json' },
    });
    await env.DB.prepare(
      'INSERT INTO reports (id, name, schema_version, locked, created_at) VALUES (?, ?, ?, 0, ?)'
    )
      .bind(id, name, schemaVersion, createdAt)
      .run();
  } else {
    // Local dev / environments without R2 — store in D1 as before
    await env.DB.prepare(
      'INSERT INTO reports (id, name, schema_version, payload, locked, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    )
      .bind(id, name, schemaVersion, payloadJson, createdAt)
      .run();
  }

  return new Response(JSON.stringify({ id }), { status: 201, headers });
};
