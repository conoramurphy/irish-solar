interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
}

interface ReportRow {
  id: string;
  name: string | null;
  schema_version: number;
  payload: string;
  created_at: number;
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };
  const id = params.id as string;

  const row = await env.DB.prepare(
    'SELECT id, name, schema_version, payload, created_at FROM reports WHERE id = ?'
  )
    .bind(id)
    .first<ReportRow>();

  if (!row) {
    return new Response(JSON.stringify({ error: 'Report not found' }), { status: 404, headers });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    return new Response(JSON.stringify({ error: 'Corrupt report payload' }), { status: 500, headers });
  }

  return new Response(
    JSON.stringify({
      id: row.id,
      name: row.name,
      schemaVersion: row.schema_version,
      payload,
      createdAt: row.created_at,
    }),
    { status: 200, headers }
  );
};
