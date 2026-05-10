interface Env {
  DB?: D1Database;
  RESEND_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  PUBLIC_ORIGIN?: string;
}

interface LeadContextBody {
  name?: string;
  eircode?: string;
  segment?: string;
  reportId?: string;
}

interface ContactBody {
  email?: string;
  message?: string;
  closedEarly?: boolean;
  leadContext?: LeadContextBody;
}

interface LeadRow {
  name: string;
  eircode: string;
  phone_e164: string;
  annual_spend_eur: number;
  segment: string;
  report_id: string | null;
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const onRequestOptions: PagesFunction<Env> = async ({ request, env }) => {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };

  if (!env.RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: 'Email service not configured' }), { status: 503, headers });
  }

  let body: ContactBody;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const email = (body.email ?? '').trim();
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), { status: 400, headers });
  }

  const message = (body.message ?? '').trim();
  const closedEarly = body.closedEarly === true;
  const clientCtx = body.leadContext ?? {};

  // If the client supplied a reportId, look up the leads row and use those
  // values as the trusted source — they were captured at lead-submit time and
  // can't be tampered with from the client.
  let lead: LeadRow | null = null;
  if (clientCtx.reportId && env.DB) {
    try {
      lead = await env.DB.prepare(
        'SELECT name, eircode, phone_e164, annual_spend_eur, segment, report_id FROM leads WHERE report_id = ? LIMIT 1'
      )
        .bind(clientCtx.reportId)
        .first<LeadRow>();
    } catch {
      // Leads table missing on legacy envs — fall through with client-supplied values.
      lead = null;
    }
  }

  const name = lead?.name ?? clientCtx.name ?? '';
  const eircode = lead?.eircode ?? clientCtx.eircode ?? '';
  const segment = lead?.segment ?? clientCtx.segment ?? '';
  const phone = lead?.phone_e164 ?? '';
  const annualSpend = lead?.annual_spend_eur ?? null;
  const reportId = lead?.report_id ?? clientCtx.reportId ?? '';

  const publicOrigin = env.PUBLIC_ORIGIN ?? 'https://wattprofit.ie';
  const reportLink = reportId && segment !== 'other'
    ? `${publicOrigin}/report/${segment}/${reportId}`
    : '';

  const who = name || email;
  const subject = closedEarly
    ? `Watt Profit — lead captured${name ? ` (${name})` : ''}`
    : `Watt Profit — new enquiry from ${who}`;

  // Build context lines that only render when set, so wizard-context (which
  // has none of this) just shows email + message.
  const contextLines: { label: string; value: string }[] = [];
  if (name) contextLines.push({ label: 'Name', value: name });
  contextLines.push({ label: 'Email', value: email });
  if (phone) contextLines.push({ label: 'Phone', value: phone });
  if (eircode) contextLines.push({ label: 'Eircode', value: eircode });
  if (segment) contextLines.push({ label: 'Segment', value: segment });
  if (annualSpend != null) contextLines.push({ label: 'Annual spend', value: `€${annualSpend.toLocaleString('en-IE')}` });
  if (reportLink) contextLines.push({ label: 'Report', value: reportLink });

  const textBody = [
    contextLines.map(l => `${l.label}: ${l.value}`).join('\n'),
    '',
    message ? `Message:\n${message}` : '(Form closed before message was added.)',
  ].join('\n');

  const htmlBody = [
    ...contextLines.map(l =>
      l.label === 'Report'
        ? `<p><strong>${l.label}:</strong> <a href="${escapeHtml(l.value)}">${escapeHtml(l.value)}</a></p>`
        : `<p><strong>${l.label}:</strong> ${escapeHtml(l.value)}</p>`
    ),
    message
      ? `<p><strong>Message:</strong></p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`
      : `<p style="color:#888;">(Form closed before message was added.)</p>`,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Watt Profit <onboarding@resend.dev>',
      to: ['conor.smurf@gmail.com'],
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
