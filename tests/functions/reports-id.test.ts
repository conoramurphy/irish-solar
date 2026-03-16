import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  onRequestGet,
  onRequestPatch,
  onRequestDelete,
} from '../../functions/api/reports/[id]';

// ── helpers ────────────────────────────────────────────────────────────────

interface ReportRow {
  id: string;
  name: string | null;
  schema_version: number;
  payload: string | null;
  locked: number;
  created_at: number;
}

function makeD1(firstResult: ReportRow | null = null, runChanges = 1) {
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
  } as unknown as Parameters<typeof onRequestGet>[0];
}

function getReq(id = 'abc-123') {
  return new Request(`https://example.com/api/reports/${id}`);
}

function patchReq(body: unknown, id = 'abc-123') {
  return new Request(`https://example.com/api/reports/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deleteReq(id = 'abc-123') {
  return new Request(`https://example.com/api/reports/${id}`, { method: 'DELETE' });
}

function makeRow(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'abc-123',
    name: 'Test Report',
    schema_version: 1,
    payload: JSON.stringify({ config: { location: 'Dublin' } }),
    locked: 0,
    created_at: 1700000000000,
    ...overrides,
  };
}

// ── GET tests ──────────────────────────────────────────────────────────────

describe('GET /api/reports/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when row not in D1', async () => {
    const { db } = makeD1(null);
    const ctx = makeCtx(getReq(), { DB: db }, { id: 'abc-123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(404);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/not found/i);
  });

  it('returns report data from D1 payload column', async () => {
    const payload = { config: { location: 'Dublin' } };
    const row = makeRow({ payload: JSON.stringify(payload) });
    const { db } = makeD1(row);
    const ctx = makeCtx(getReq(), { DB: db }, { id: 'abc-123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as { payload: typeof payload };
    expect(data.payload).toEqual(payload);
  });

  it('fetches payload from R2 when D1 payload is null and REPORTS_BUCKET available', async () => {
    const r2Payload = { config: { location: 'Cork' } };
    const row = makeRow({ payload: null });
    const { db } = makeD1(row);
    const r2 = makeR2(JSON.stringify(r2Payload));
    const ctx = makeCtx(getReq(), { DB: db, REPORTS_BUCKET: r2 }, { id: 'abc-123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as { payload: typeof r2Payload };
    expect(data.payload).toEqual(r2Payload);
    expect(r2.get).toHaveBeenCalledWith('reports/abc-123.json');
  });

  it('returns 404 when D1 payload is null and R2 has no object', async () => {
    const row = makeRow({ payload: null });
    const { db } = makeD1(row);
    const r2 = makeR2(null);
    const ctx = makeCtx(getReq(), { DB: db, REPORTS_BUCKET: r2 }, { id: 'abc-123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(404);
  });

  it('returns 500 for corrupt JSON payload', async () => {
    const row = makeRow({ payload: '{not valid json' });
    const { db } = makeD1(row);
    const ctx = makeCtx(getReq(), { DB: db }, { id: 'abc-123' });
    const res = await onRequestGet(ctx);
    expect(res.status).toBe(500);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/corrupt/i);
  });

  it('skips R2 when D1 payload is present (efficiency)', async () => {
    const row = makeRow({ payload: JSON.stringify({ config: {} }) });
    const { db } = makeD1(row);
    const r2 = makeR2();
    const ctx = makeCtx(getReq(), { DB: db, REPORTS_BUCKET: r2 }, { id: 'abc-123' });
    await onRequestGet(ctx);
    expect(r2.get).not.toHaveBeenCalled();
  });

  it('returns locked: true when row.locked === 1', async () => {
    const row = makeRow({ locked: 1 });
    const { db } = makeD1(row);
    const ctx = makeCtx(getReq(), { DB: db }, { id: 'abc-123' });
    const res = await onRequestGet(ctx);
    const data = await res.json() as { locked: boolean };
    expect(data.locked).toBe(true);
  });

  it('returns locked: false when row.locked === 0', async () => {
    const row = makeRow({ locked: 0 });
    const { db } = makeD1(row);
    const ctx = makeCtx(getReq(), { DB: db }, { id: 'abc-123' });
    const res = await onRequestGet(ctx);
    const data = await res.json() as { locked: boolean };
    expect(data.locked).toBe(false);
  });
});

// ── PATCH tests ────────────────────────────────────────────────────────────

describe('PATCH /api/reports/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for non-JSON body', async () => {
    const req = new Request('https://example.com/api/reports/abc-123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json !!',
    });
    const { db } = makeD1();
    const ctx = makeCtx(req, { DB: db }, { id: 'abc-123' });
    const res = await onRequestPatch(ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/invalid json/i);
  });

  it('returns 400 when locked is not boolean', async () => {
    const req = patchReq({ locked: 'yes' });
    const { db } = makeD1();
    const ctx = makeCtx(req, { DB: db }, { id: 'abc-123' });
    const res = await onRequestPatch(ctx);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/locked must be a boolean/i);
  });

  it('returns 404 when no rows changed', async () => {
    const req = patchReq({ locked: true });
    const { db } = makeD1(null, 0);
    const ctx = makeCtx(req, { DB: db }, { id: 'abc-123' });
    const res = await onRequestPatch(ctx);
    expect(res.status).toBe(404);
  });

  it('updates to locked=1 when { locked: true }', async () => {
    const { db, stmt } = makeD1(null, 1);
    const req = patchReq({ locked: true });
    const ctx = makeCtx(req, { DB: db }, { id: 'abc-123' });
    const res = await onRequestPatch(ctx);
    expect(res.status).toBe(200);
    const bindArgs = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(bindArgs[0]).toBe(1);
  });

  it('updates to locked=0 when { locked: false }', async () => {
    const { db, stmt } = makeD1(null, 1);
    const req = patchReq({ locked: false });
    const ctx = makeCtx(req, { DB: db }, { id: 'abc-123' });
    const res = await onRequestPatch(ctx);
    expect(res.status).toBe(200);
    const bindArgs = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(bindArgs[0]).toBe(0);
  });

  it('returns { id, locked } on success', async () => {
    const { db } = makeD1(null, 1);
    const req = patchReq({ locked: true });
    const ctx = makeCtx(req, { DB: db }, { id: 'abc-123' });
    const res = await onRequestPatch(ctx);
    expect(res.status).toBe(200);
    const data = await res.json() as { id: string; locked: boolean };
    expect(data.id).toBe('abc-123');
    expect(data.locked).toBe(true);
  });
});

// ── DELETE tests ───────────────────────────────────────────────────────────

describe('DELETE /api/reports/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 404 when no rows changed', async () => {
    const { db } = makeD1(null, 0);
    const ctx = makeCtx(deleteReq(), { DB: db }, { id: 'abc-123' });
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(404);
    const data = await res.json() as { error: string };
    expect(data.error).toMatch(/not found/i);
  });

  it('deletes row from D1', async () => {
    const { db, stmt } = makeD1(null, 1);
    const ctx = makeCtx(deleteReq(), { DB: db }, { id: 'abc-123' });
    await onRequestDelete(ctx);
    expect(db.prepare).toHaveBeenCalledWith(
      expect.stringMatching(/DELETE FROM reports/i)
    );
    const bindArgs = (stmt.bind as ReturnType<typeof vi.fn>).mock.calls[0] as unknown[];
    expect(bindArgs[0]).toBe('abc-123');
  });

  it('deletes from R2 when REPORTS_BUCKET available', async () => {
    const { db } = makeD1(null, 1);
    const r2 = makeR2();
    const ctx = makeCtx(deleteReq(), { DB: db, REPORTS_BUCKET: r2 }, { id: 'abc-123' });
    await onRequestDelete(ctx);
    expect(r2.delete).toHaveBeenCalledWith('reports/abc-123.json');
  });

  it('R2 delete failure does not fail the request (best-effort)', async () => {
    const { db } = makeD1(null, 1);
    const r2 = makeR2();
    r2.delete.mockRejectedValueOnce(new Error('R2 unavailable'));
    const ctx = makeCtx(deleteReq(), { DB: db, REPORTS_BUCKET: r2 }, { id: 'abc-123' });
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(204);
  });

  it('returns 204 on success', async () => {
    const { db } = makeD1(null, 1);
    const ctx = makeCtx(deleteReq(), { DB: db }, { id: 'abc-123' });
    const res = await onRequestDelete(ctx);
    expect(res.status).toBe(204);
  });
});
