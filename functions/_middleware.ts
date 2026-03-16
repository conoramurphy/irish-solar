/**
 * Middleware for /r/:id and /r/:id/edit routes.
 *
 * Social media crawlers (Twitter, LinkedIn, WhatsApp, etc.) do NOT execute JS, so
 * react-helmet and client-side OG tags are invisible to them. This middleware
 * intercepts requests to /r/* routes, fetches the report from D1, then uses
 * HTMLRewriter to inject dynamic <meta og:*> tags into the SPA's index.html
 * before it is served — all at the edge, before the crawler sees anything.
 */

interface Env {
  DB: D1Database;
  REPORTS_BUCKET?: R2Bucket;
}

interface ReportRow {
  id: string;
  name: string | null;
  payload: string | null;
}

interface ReportPayload {
  config?: {
    location?: string;
    solarKwp?: number;
    batteryKwh?: number;
  };
  result?: {
    annualSavings?: number;
    paybackYears?: number;
  };
}

function buildOgDescription(payload: ReportPayload): string {
  const location = payload.config?.location ?? 'Ireland';
  const solar = payload.config?.solarKwp;
  const battery = payload.config?.batteryKwh;
  const savings = payload.result?.annualSavings;
  const payback = payload.result?.paybackYears;

  const parts: string[] = [`Location: ${location}`];
  if (solar) parts.push(`${solar} kWp solar`);
  if (battery) parts.push(`${battery} kWh battery`);
  if (savings) parts.push(`€${Math.round(savings).toLocaleString()} annual savings`);
  if (payback) parts.push(`${payback.toFixed(1)} yr payback`);

  return parts.join(' · ');
}

class OgTagInjector {
  private title: string;
  private description: string;
  private url: string;

  constructor(title: string, description: string, url: string) {
    this.title = title;
    this.description = description;
    this.url = url;
  }

  element(element: Element) {
    element.append(
      `<meta property="og:type" content="article" />` +
      `<meta property="og:title" content="${escapeAttr(this.title)}" />` +
      `<meta property="og:description" content="${escapeAttr(this.description)}" />` +
      `<meta property="og:url" content="${escapeAttr(this.url)}" />` +
      `<meta name="twitter:card" content="summary" />` +
      `<meta name="twitter:title" content="${escapeAttr(this.title)}" />` +
      `<meta name="twitter:description" content="${escapeAttr(this.description)}" />`,
      { html: true }
    );
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, next, env, params } = context;
  const url = new URL(request.url);

  // Only intercept /r/:id paths; let everything else through unchanged
  if (!url.pathname.startsWith('/r/')) {
    return next();
  }

  // Only bother with GET requests from likely crawlers (or any GET — HTMLRewriter is fast)
  if (request.method !== 'GET') {
    return next();
  }

  // Extract the report ID from /r/:id or /r/:id/edit
  const segments = url.pathname.split('/').filter(Boolean); // ['r', id] or ['r', id, 'edit']
  const id = segments[1];

  if (!id) return next();

  // Fetch the original SPA response first
  const response = await next();
  const contentType = response.headers.get('Content-Type') ?? '';

  // Only transform HTML responses
  if (!contentType.includes('text/html')) return response;

  // Try to fetch report metadata from D1; if unavailable, serve the page unchanged
  let row: ReportRow | null = null;
  try {
    row = await env.DB.prepare(
      'SELECT id, name, payload FROM reports WHERE id = ?'
    ).bind(id).first<ReportRow>();
  } catch {
    // D1 unavailable (e.g. local dev without DB binding) — serve page as-is
    return response;
  }

  if (!row) return response;

  // Resolve payload: R2 first (new records), D1 payload column as fallback (old records)
  let payloadJson: string | null = row.payload;
  if (!payloadJson && env.REPORTS_BUCKET) {
    try {
      const obj = await env.REPORTS_BUCKET.get(`reports/${id}.json`);
      if (obj) payloadJson = await obj.text();
    } catch {
      // R2 unavailable — skip OG injection
    }
  }

  if (!payloadJson) return response;

  let payload: ReportPayload = {};
  try {
    payload = JSON.parse(payloadJson) as ReportPayload;
    if (!payload || typeof payload !== 'object') payload = {};
  } catch {
    return response;
  }

  const reportName = row.name ?? 'Solar ROI Report';
  const title = `${reportName} — Solar ROI Calculator`;
  const description = buildOgDescription(payload);
  const canonicalUrl = url.href;

  return new HTMLRewriter()
    .on('head', new OgTagInjector(title, description, canonicalUrl))
    .transform(response);
};
