interface Env {
  RESEND_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim());
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };

  if (!env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 503, headers });
  }

  let body: { email?: string; role?: string; message?: string; closedEarly?: boolean };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const email = (body.email ?? '').trim();
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers });
  }

  const role = (body.role ?? 'unknown').trim();
  const message = (body.message ?? '').trim();
  const closedEarly = body.closedEarly === true;

  const subject = closedEarly
    ? `Watt Profit — lead captured (${role})`
    : `Watt Profit — new enquiry from ${role}`;

  const textBody = message
    ? `Email: ${email}\nRole: ${role}\n\n${message}`
    : `Email: ${email}\nRole: ${role}\n\n(Form closed before message was added.)`;

  const htmlBody = `
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Role:</strong> ${role}</p>
    ${message
      ? `<p><strong>Message:</strong></p><p>${message.replace(/\n/g, '<br>')}</p>`
      : `<p style="color:#888;">(Form closed before message was added.)</p>`
    }
  `.trim();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Watt Profit <onboarding@resend.dev>',
      to: ['conormurphy@outlook.com'],
      reply_to: email,
      subject,
      text: textBody,
      html: htmlBody,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    return new Response(
      JSON.stringify({ error: err.message ?? `Resend error ${res.status}` }),
      { status: 502, headers }
    );
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
