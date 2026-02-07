import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLogStore } from '../../src/stores/logStore';
import { endSpan, logError, logInfo, logWarn, startSpan } from '../../src/utils/logger';

function resetStore() {
  useLogStore.setState({
    entries: [],
    spans: {},
    minLevel: 'info'
  });
}

describe('logger', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('adds entries to the log store with scope/level/message', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.spyOn(Math, 'random').mockReturnValue(0.25);

    logInfo('calc', 'start', { a: 1 });
    logWarn('calc', 'warned');
    logError('calc', 'failed', 'oops');

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(3);

    // Newest first.
    expect(entries[0]).toMatchObject({ scope: 'calc', level: 'error', message: 'failed' });
    expect(entries[1]).toMatchObject({ scope: 'calc', level: 'warn', message: 'warned' });
    expect(entries[2]).toMatchObject({ scope: 'calc', level: 'info', message: 'start' });

    expect(entries[2].details).toEqual({ a: 1 });
    expect(entries[0].details).toBe('oops');
  });

  it('safe-serializes circular details (does not throw)', () => {
    const circular: any = { a: 1 };
    circular.self = circular;

    expect(() => logInfo('ui', 'circular', circular)).not.toThrow();

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(1);

    // Implementation currently falls back to String(details) on circular.
    expect(typeof entries[0].details).toBe('string');
  });

  it('associates entries with spans when spanId is provided', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const spanId = startSpan('engine', 'Test operation');
    logInfo('engine', 'inside span', { a: 1 }, { spanId });

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].spanId).toBe(spanId);
  });

  it('span helpers create/update spans with timestamps and status', () => {
    // startSpan uses Date.now twice (id + startTs), then endSpan uses it once.
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(100) // makeId
      .mockReturnValueOnce(100) // startTs
      .mockReturnValueOnce(200); // endTs

    const spanId = startSpan('solar', 'Load', { loc: 'Cavan' });
    endSpan(spanId, 'success', { result: 'ok' });

    const span = useLogStore.getState().spans[spanId];
    expect(span).toMatchObject({
      scope: 'solar',
      name: 'Load',
      status: 'success',
      startTs: 100,
      endTs: 200
    });
  });
});
