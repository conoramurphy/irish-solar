// POST /api/leads — Watt Profit ads funnel lead capture.
//
// For segment='hotel'|'dairy': also persists a personalised SavedReport-shaped
// payload (with `kind='funnel'` so /r listing filters it out) and emails Conor
// a summary plus a clickable link to /report/{seg}/:reportId.
// For segment='other': writes a leads row only and emails the summary.

import { nanoid } from 'nanoid';

interface Env {
  DB: D1Database;
  REPORTS_BUCKET?: R2Bucket;
  RESEND_API_KEY?: string;
  ALLOWED_ORIGINS?: string;
  PUBLIC_ORIGIN?: string;
}

interface LeadBody {
  segment?: 'hotel' | 'dairy' | 'other';
  name?: string;
  eircode?: string;
  phoneE164?: string;
  annualSpendEur?: number;
  businessType?: string;
  paths?: unknown[];
  scaledReport?: Record<string, unknown> & { name?: string; schemaVersion?: number };
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') ?? '';
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim());
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

function validate(body: LeadBody): string | null {
  if (body.segment !== 'hotel' && body.segment !== 'dairy' && body.segment !== 'other') {
    return 'segment must be hotel, dairy, or other';
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return 'name is required';
  }
  if (!body.eircode || typeof body.eircode !== 'string') {
    return 'eircode is required';
  }
  if (!body.phoneE164 || typeof body.phoneE164 !== 'string' || !/^\+\d{7,15}$/.test(body.phoneE164)) {
    return 'phoneE164 must be a valid international phone number';
  }
  if (
    typeof body.annualSpendEur !== 'number' ||
    !Number.isFinite(body.annualSpendEur) ||
    body.annualSpendEur < 1000
  ) {
    return 'annualSpendEur must be a number >= 1000';
  }
  if ((body.segment === 'hotel' || body.segment === 'dairy') && !body.scaledReport) {
    return 'scaledReport is required for hotel/dairy submissions';
  }
  return null;
}

async function sendNotificationEmail(
  env: Env,
  fields: {
    name: string;
    eircode: string;
    phoneE164: string;
    annualSpendEur: number;
    segment: 'hotel' | 'dairy' | 'other';
    businessType?: string;
    reportId: string | null;
    publicOrigin: string;
  }
): Promise<void> {
  if (!env.RESEND_API_KEY) return; // local dev / unconfigured envs

  const reportLink = fields.reportId && fields.segment !== 'other'
    ? `${fields.publicOrigin}/report/${fields.segment}/${fields.reportId}`
    : null;

  const subject = `Watt Profit — new ${fields.segment} lead from ${fields.name}`;

  const textLines = [
    `Name: ${fields.name}`,
    `Eircode: ${fields.eircode}`,
    `Phone: ${fields.phoneE164}`,
    `Segment: ${fields.segment}`,
    fields.businessType ? `Business type: ${fields.businessType}` : null,
    `Annual spend: €${fields.annualSpendEur.toLocaleString('en-IE')}`,
    reportLink ? `\nPersonalised report: ${reportLink}` : null,
  ].filter(Boolean);

  const htmlLines = [
    `<p><strong>Name:</strong> ${escapeHtml(fields.name)}</p>`,
    `<p><strong>Eircode:</strong> ${escapeHtml(fields.eircode)}</p>`,
    `<p><strong>Phone:</strong> <a href="tel:${fields.phoneE164}">${escapeHtml(fields.phoneE164)}</a></p>`,
    `<p><strong>Segment:</strong> ${escapeHtml(fields.segment)}</p>`,
    fields.businessType
      ? `<p><strong>Business type:</strong> ${escapeHtml(fields.businessType)}</p>`
      : '',
    `<p><strong>Annual spend:</strong> €${fields.annualSpendEur.toLocaleString('en-IE')}</p>`,
    reportLink
      ? `<p><strong>Personalised report:</strong> <a href="${reportLink}">${escapeHtml(reportLink)}</a></p>`
      : '',
  ];

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Watt Profit <onboarding@resend.dev>',
      to: ['conor.smurf@gmail.com'],
      subject,
      text: textLines.join('\n'),
      html: htmlLines.join(''),
    }),
  }).catch(() => undefined);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function persistFunnelReport(
  env: Env,
  scaledReport: NonNullable<LeadBody['scaledReport']>,
  description: string,
  segment: 'hotel' | 'dairy',
  name: string,
  eircode: string
): Promise<string> {
  const id = nanoid();
  const reportName = `funnel-${segment}-${eircode.replace(/\s/g, '').toLowerCase()}-${id.slice(0, 6)}`;
  const schemaVersion =
    typeof scaledReport.schemaVersion === 'number' ? scaledReport.schemaVersion : 1;
  const createdAt = Date.now();
  const payloadJson = JSON.stringify({ ...scaledReport, name: reportName });

  if (env.REPORTS_BUCKET) {
    await env.REPORTS_BUCKET.put(`reports/${id}.json`, payloadJson, {
      httpMetadata: { contentType: 'application/json' },
    });
    try {
      await env.DB.prepare(
        'INSERT INTO reports (id, name, description, schema_version, locked, kind, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)'
      )
        .bind(id, reportName, description, schemaVersion, 'funnel', createdAt)
        .run();
    } catch (err) {
      await env.REPORTS_BUCKET.delete(`reports/${id}.json`).catch(() => undefined);
      throw err;
    }
  } else {
    await env.DB.prepare(
      'INSERT INTO reports (id, name, description, schema_version, payload, locked, kind, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
    )
      .bind(id, reportName, description, schemaVersion, payloadJson, 'funnel', createdAt)
      .run();
  }

  // Sanity: name was used.
  void name;

  return id;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(request, env) };

  let body: LeadBody;
  try {
    body = (await request.json()) as LeadBody;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
  }

  const validationError = validate(body);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), { status: 400, headers });
  }

  const segment = body.segment as 'hotel' | 'dairy' | 'other';
  const name = body.name!.trim();
  const eircode = body.eircode!.trim().toUpperCase();
  const phoneE164 = body.phoneE164!.trim();
  const annualSpendEur = Math.round(body.annualSpendEur!);
  const businessType = body.businessType?.trim() || null;

  let reportId: string | null = null;

  if (segment === 'hotel' || segment === 'dairy') {
    const description = JSON.stringify({
      leadName: name,
      leadEircode: eircode,
      leadSegment: segment,
      paths: body.paths ?? [],
    });
    try {
      reportId = await persistFunnelReport(
        env,
        body.scaledReport!,
        description,
        segment,
        name,
        eircode
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Database error';
      return new Response(JSON.stringify({ error: `Failed to save report: ${message}` }), {
        status: 500,
        headers,
      });
    }
  }

  const leadId = nanoid();
  await env.DB.prepare(
    'INSERT INTO leads (id, name, eircode, phone_e164, annual_spend_eur, segment, business_type, report_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(leadId, name, eircode, phoneE164, annualSpendEur, segment, businessType, reportId, Date.now())
    .run();

  // Email is best-effort — don't block the response on Resend.
  const publicOrigin = env.PUBLIC_ORIGIN ?? 'https://wattprofit.ie';
  await sendNotificationEmail(env, {
    name,
    eircode,
    phoneE164,
    annualSpendEur,
    segment,
    businessType: businessType ?? undefined,
    reportId,
    publicOrigin,
  });

  return new Response(JSON.stringify({ ok: true, segment, reportId }), {
    status: 201,
    headers,
  });
};
