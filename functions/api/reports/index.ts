import { nanoid } from 'nanoid';

interface Env {
  DB: D1Database;
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
  const name = body.name ?? body.report.name ?? null;
  const schemaVersion = typeof body.report.schemaVersion === 'number' ? body.report.schemaVersion : 1;
  const createdAt = Date.now();

  await env.DB.prepare(
    'INSERT INTO reports (id, name, schema_version, payload, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, name, schemaVersion, JSON.stringify(body.report), createdAt)
    .run();

  return new Response(JSON.stringify({ id }), { status: 201, headers });
};
