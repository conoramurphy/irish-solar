import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from '../../functions/api/reports/index';

vi.mock('nanoid', () => ({ nanoid: () => 'test-id-123' }));

// ── helpers ────────────────────────────────────────────────────────────────

function makeD1(firstResult: unknown = null, runChanges = 1) {
  const bindResult = {
    run: vi.fn().mockResolvedValue({ meta: { changes: runChanges } }),
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
  return {
    request: req,
    env,
    params,
    data: {},
    next: vi.fn().mockResolvedValue(new Response('', { headers: { 'Content-Type': 'text/html' } })),
    functionPath: '',
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as Parameters<typeof onRequestPost>[0];
}

function postRequest(body: unknown) {
  return new Request('https://example.com/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('POST /api/reports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for non-JSON body', async () => {
    const req = new Request('https://example.com/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json !!',
    });
    const { db } = makeD1();
    const ctx = makeCtx(req, { DB: db });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/invalid json/i);
  });

  it('returns 400 for missing report field', async () => {
    const req = postRequest({ name: 'My Report' });
    const { db } = makeD1();
    const ctx = makeCtx(req, { DB: db });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/missing report payload/i);
  });

  it('returns 400 when report is not an object', async () => {
    const req = postRequest({ report: 'a string' });
    const { db } = makeD1();
    const ctx = makeCtx(req, { DB: db });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/missing report payload/i);
  });

  it('stores payload inline in D1 when no REPORTS_BUCKET', async () => {
    const { db, stmt, bindResult } = makeD1();
    const req = postRequest({ report: { name: 'Test', schemaVersion: 1 } });
    const ctx = makeCtx(req, { DB: db });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(201);
    // The SQL should contain the payload column
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringContaining('payload')
    );
    expect(stmt.bind).toHaveBeenCalled();
    expect(bindResult.run).toHaveBeenCalled();
  });

  it('D1 INSERT includes payload column when no R2', async () => {
    const { db } = makeD1();
    const req = postRequest({ report: { foo: 'bar' } });
    const ctx = makeCtx(req, { DB: db });
    await onRequestPost(ctx);
    const sql = (db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).toContain('payload');
  });

  it('writes to R2 and stores metadata-only in D1 when REPORTS_BUCKET present', async () => {
    const { db } = makeD1();
    const r2 = makeR2();
    const req = postRequest({ report: { schemaVersion: 1 } });
    const ctx = makeCtx(req, { DB: db, REPORTS_BUCKET: r2 });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(201);
    expect(r2.put).toHaveBeenCalledOnce();
    expect(r2.put).toHaveBeenCalledWith(
      'reports/test-id-123.json',
      expect.any(String),
      expect.objectContaining({ httpMetadata: { contentType: 'application/json' } })
    );
  });

  it('D1 INSERT does NOT include payload column when R2 is used', async () => {
    const { db } = makeD1();
    const r2 = makeR2();
    const req = postRequest({ report: { foo: 'bar' } });
    const ctx = makeCtx(req, { DB: db, REPORTS_BUCKET: r2 });
    await onRequestPost(ctx);
    const sql = (db.prepare as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(sql).not.toContain('payload');
  });

  it('deletes R2 object when D1 INSERT throws (orphan rollback)', async () => {
    const { db, stmt, bindResult } = makeD1();
    bindResult.run.mockRejectedValueOnce(new Error('D1 write failed'));
    const r2 = makeR2();
    const req = postRequest({ report: { schemaVersion: 1 } });
    const ctx = makeCtx(req, { DB: db, REPORTS_BUCKET: r2 });
    await expect(onRequestPost(ctx)).rejects.toThrow('D1 write failed');
    expect(r2.delete).toHaveBeenCalledWith('reports/test-id-123.json');
    // Suppress unused-variable lint warning – stmt bind is called before run
    expect(stmt.bind).toHaveBeenCalled();
  });

  it('returns 201 with { id } on success', async () => {
    const { db } = makeD1();
    const req = postRequest({ report: { schemaVersion: 1 } });
    const ctx = makeCtx(req, { DB: db });
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(201);
    const data = await res.json() as { id: string };
    expect(data.id).toBe('test-id-123');
  });

  it('uses body.name if present', async () => {
    const { db, stmt } = makeD1();
    const req = postRequest({ name: 'Override Name', report: { name: 'Ignored', schemaVersion: 1 } });
    const ctx = makeCtx(req, { DB: db });
    await onRequestPost(ctx);
    const bindArgs = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    // bind(id, name, schemaVersion, payloadJson, createdAt) for no-R2 path
    expect(bindArgs[1]).toBe('Override Name');
  });

  it('falls back to body.report.name when body.name absent', async () => {
    const { db, stmt } = makeD1();
    const req = postRequest({ report: { name: 'Report Name', schemaVersion: 1 } });
    const ctx = makeCtx(req, { DB: db });
    await onRequestPost(ctx);
    const bindArgs = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(bindArgs[1]).toBe('Report Name');
  });

  it('uses null name when neither body.name nor body.report.name present', async () => {
    const { db, stmt } = makeD1();
    const req = postRequest({ report: { schemaVersion: 1 } });
    const ctx = makeCtx(req, { DB: db });
    await onRequestPost(ctx);
    const bindArgs = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(bindArgs[1]).toBeNull();
  });

  it('defaults schemaVersion to 1 when not a number', async () => {
    const { db, stmt } = makeD1();
    const req = postRequest({ report: { schemaVersion: 'not-a-number' } });
    const ctx = makeCtx(req, { DB: db });
    await onRequestPost(ctx);
    const bindArgs = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    // bind(id, name, schemaVersion, payloadJson, createdAt)
    expect(bindArgs[2]).toBe(1);
  });
});
