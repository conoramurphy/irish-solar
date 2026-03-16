import { describe, it, expect, vi, beforeEach } from 'vitest';

// HTMLRewriter is a Cloudflare Workers global — it does not exist in Node.js/jsdom.
// We stub it before importing the module under test so the import-time references resolve.

class MockHTMLRewriter {
  private handlers: Map<string, { element: (el: { append: (html: string, opts?: { html: boolean }) => void }) => void }> = new Map();

  on(selector: string, handler: { element: (el: { append: (html: string, opts?: { html: boolean }) => void }) => void }) {
    this.handlers.set(selector, handler);
    return this;
  }

  transform(response: Response): Response {
    // Record that transform was called; return the response unchanged for test inspection
    return new Response(`<!-- transformed -->`, {
      status: response.status,
      headers: response.headers,
    });
  }

  // Helper: call the 'head' handler's element method with a spy
  callHeadHandler(appendMock: ReturnType<typeof vi.fn>) {
    const handler = this.handlers.get('head');
    if (handler) {
      handler.element({ append: appendMock });
    }
  }
}

vi.stubGlobal('HTMLRewriter', MockHTMLRewriter);

// Now we can import the middleware (it references HTMLRewriter at runtime)
import { onRequest } from '../../functions/_middleware';

// ── helpers ────────────────────────────────────────────────────────────────

interface ReportRow {
  id: string;
  name: string | null;
  payload: string | null;
}

function makeD1(firstResult: ReportRow | null = null) {
  const bindResult = {
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn().mockResolvedValue(firstResult),
  };
  const stmt = { bind: vi.fn().mockReturnValue(bindResult) };
  const db = { prepare: vi.fn().mockReturnValue(stmt) };
  return { db, stmt, bindResult };
}

function makeR2(getResult: string | null = null) {
  return {
    get: vi.fn().mockResolvedValue(
      getResult ? { text: vi.fn().mockResolvedValue(getResult) } : null
    ),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function makeCtx(
  req: Request,
  env: object,
  params: Record<string, string> = {}
) {
  const htmlResponse = new Response('<html><head></head><body></body></html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  return {
    request: req,
    env,
    params,
    data: {},
    next: vi.fn().mockResolvedValue(htmlResponse),
    functionPath: '',
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as Parameters<typeof onRequest>[0];
}

function getReq(path: string, method = 'GET') {
  return new Request(`https://example.com${path}`, { method });
}

function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'abc-123',
    name: 'My Solar Report',
    payload: JSON.stringify({
      config: { location: 'Dublin', systemSizeKwp: 10, batterySizeKwh: 5 },
      result: { annualSavings: 1500, simplePayback: 7.5 },
    }),
    ...overrides,
  };
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('_middleware onRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through when pathname does not start with /r/', async () => {
    const { db } = makeD1();
    const ctx = makeCtx(getReq('/api/reports'), { DB: db });
    const res = await onRequest(ctx);
    expect(ctx.next).toHaveBeenCalled();
    // D1 should not be queried for non /r/ paths
    expect(db.prepare).not.toHaveBeenCalled();
    // Response should be the passthrough response
    expect(res).toBeDefined();
  });

  it('passes through for non-GET method (POST)', async () => {
    const { db } = makeD1();
    const ctx = makeCtx(getReq('/r/abc-123', 'POST'), { DB: db });
    const res = await onRequest(ctx);
    expect(ctx.next).toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
    expect(res).toBeDefined();
  });

  it('passes through when /r/ has no id segment', async () => {
    const { db } = makeD1();
    const ctx = makeCtx(getReq('/r/'), { DB: db });
    const res = await onRequest(ctx);
    expect(ctx.next).toHaveBeenCalled();
    expect(db.prepare).not.toHaveBeenCalled();
    expect(res).toBeDefined();
  });

  it('passes through non-HTML content-type response', async () => {
    const { db } = makeD1(makeRow());
    const jsonResponse = new Response('{}', {
      headers: { 'Content-Type': 'application/json' },
    });
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    (ctx.next as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse);
    const res = await onRequest(ctx);
    // Should return the response unchanged (not the HTMLRewriter-transformed one).
    // The middleware checks content-type AFTER the D1 query and returns early —
    // so D1 IS queried, but the response still comes back with the original content-type.
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('returns response unchanged when D1 throws', async () => {
    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error('D1 unavailable')),
        }),
      }),
    };
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    const res = await onRequest(ctx);
    // Should not throw; response is the HTML passthrough
    expect(res).toBeDefined();
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('returns response unchanged when report not in D1', async () => {
    const { db } = makeD1(null);
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    const res = await onRequest(ctx);
    // passthrough HTML, not transformed
    expect(res).toBeDefined();
    expect(res.headers.get('Content-Type')).toContain('text/html');
  });

  it('returns response unchanged when D1 payload is null and no R2', async () => {
    const row = makeRow({ payload: null });
    const { db } = makeD1(row);
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    const res = await onRequest(ctx);
    expect(res).toBeDefined();
  });

  it('returns response unchanged when payload JSON is corrupt', async () => {
    const row = makeRow({ payload: '{not valid json' });
    const { db } = makeD1(row);
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    const res = await onRequest(ctx);
    expect(res).toBeDefined();
  });

  it('injects OG tags for valid D1-backed report', async () => {
    const row = makeRow();
    const { db } = makeD1(row);
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    const res = await onRequest(ctx);
    // HTMLRewriter.transform was called — response body starts with our marker
    const text = await res.text();
    expect(text).toContain('<!-- transformed -->');
  });

  it('injects OG tags reading from R2 when D1 payload is null', async () => {
    const r2Payload = JSON.stringify({
      config: { location: 'Cork', systemSizeKwp: 8, batterySizeKwh: 10 },
      result: { annualSavings: 2000, simplePayback: 8.0 },
    });
    const row = makeRow({ payload: null });
    const { db } = makeD1(row);
    const r2 = makeR2(r2Payload);
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db, REPORTS_BUCKET: r2 });
    const res = await onRequest(ctx);
    expect(r2.get).toHaveBeenCalledWith('reports/abc-123.json');
    const text = await res.text();
    expect(text).toContain('<!-- transformed -->');
  });

  it('OG title includes report name', async () => {
    const row = makeRow({ name: 'Coastal Hotel Solar' });
    const { db } = makeD1(row);

    // Capture the append calls by intercepting the HTMLRewriter.on() handler invocation.
    // We track what was appended by wrapping the transform step.
    const appendMock = vi.fn();
    const instances: MockHTMLRewriter[] = [];

    class CapturingRewriter extends MockHTMLRewriter {
      constructor() {
        super();
        instances.push(this);
      }
    }

    vi.stubGlobal('HTMLRewriter', CapturingRewriter);

    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    await onRequest(ctx);

    expect(instances.length).toBeGreaterThan(0);
    instances[0].callHeadHandler(appendMock);
    expect(appendMock).toHaveBeenCalled();
    const injectedHtml = (appendMock.mock.calls[0] as [string])[0];
    expect(injectedHtml).toContain('Coastal Hotel Solar');

    // Restore original stub
    vi.stubGlobal('HTMLRewriter', MockHTMLRewriter);
  });

  it('OG description includes location, solar size, battery size, savings and payback', async () => {
    const row = makeRow({
      payload: JSON.stringify({
        config: { location: 'Galway', systemSizeKwp: 12, batterySizeKwh: 6 },
        result: { annualSavings: 1800, simplePayback: 9.2 },
      }),
    });
    const { db } = makeD1(row);

    const appendMock = vi.fn();
    const instances: MockHTMLRewriter[] = [];

    class CapturingRewriter extends MockHTMLRewriter {
      constructor() {
        super();
        instances.push(this);
      }
    }

    vi.stubGlobal('HTMLRewriter', CapturingRewriter);

    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db });
    await onRequest(ctx);

    expect(instances.length).toBeGreaterThan(0);
    instances[0].callHeadHandler(appendMock);
    expect(appendMock).toHaveBeenCalled();
    const injectedHtml = (appendMock.mock.calls[0] as [string])[0];
    expect(injectedHtml).toContain('Galway');
    expect(injectedHtml).toContain('12');      // systemSizeKwp
    expect(injectedHtml).toContain('6');       // batterySizeKwh
    expect(injectedHtml).toContain('1,800');   // annualSavings rounded
    expect(injectedHtml).toContain('9.2');     // simplePayback

    vi.stubGlobal('HTMLRewriter', MockHTMLRewriter);
  });

  it('returns response unchanged when R2.get throws', async () => {
    const row = makeRow({ payload: null });
    const { db } = makeD1(row);
    const r2 = {
      get: vi.fn().mockRejectedValue(new Error('R2 network error')),
      put: vi.fn(),
      delete: vi.fn(),
    };
    const ctx = makeCtx(getReq('/r/abc-123'), { DB: db, REPORTS_BUCKET: r2 });
    const res = await onRequest(ctx);
    // Should not throw; the middleware catches and passes through
    expect(res).toBeDefined();
  });
});
