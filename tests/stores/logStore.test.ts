import { beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldShow, useLogStore } from '../../src/stores/logStore';

function resetStore() {
  useLogStore.setState({
    entries: [],
    spans: {},
    minLevel: 'info'
  });
}

describe('logStore', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  it('prepends new entries (newest first) and sets id/ts', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    useLogStore.getState().add({ level: 'info', scope: 'test', message: 'first' });
    useLogStore.getState().add({ level: 'warn', scope: 'test', message: 'second' });

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe('second');
    expect(entries[1].message).toBe('first');

    expect(entries[0].ts).toBe(123);
    expect(typeof entries[0].id).toBe('string');
    expect(entries[0].id.length).toBeGreaterThan(0);
  });

  it('caps entries at 2000', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => 1);
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    for (let i = 0; i < 2100; i++) {
      useLogStore.getState().add({ level: 'info', scope: 'test', message: `m${i}` });
    }

    const entries = useLogStore.getState().entries;
    expect(entries).toHaveLength(2000);

    // Newest entry remains present.
    expect(entries[0].message).toBe('m2099');

    // Oldest entries are dropped.
    expect(entries.at(-1)?.message).toBe('m100');
  });

  it('clear removes all entries and spans', () => {
    useLogStore.getState().add({ level: 'info', scope: 'test', message: 'a' });
    useLogStore.getState().startSpan({ scope: 'test', name: 'span' });
    expect(useLogStore.getState().entries.length).toBe(1);
    expect(Object.keys(useLogStore.getState().spans).length).toBe(1);

    useLogStore.getState().clear();
    expect(useLogStore.getState().entries).toEqual([]);
    expect(useLogStore.getState().spans).toEqual({});
  });

  it('tracks span start/end timestamps and status', () => {
    // startSpan uses Date.now twice (id + startTs), then endSpan uses it once.
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(10) // makeId
      .mockReturnValueOnce(10) // startTs
      .mockReturnValueOnce(20); // endTs

    const id = useLogStore.getState().startSpan({ scope: 'engine', name: 'Run calculation' });
    expect(useLogStore.getState().spans[id]).toMatchObject({
      id,
      scope: 'engine',
      name: 'Run calculation',
      status: 'running',
      startTs: 10
    });

    useLogStore.getState().endSpan(id, 'success');
    expect(useLogStore.getState().spans[id]).toMatchObject({
      status: 'success',
      endTs: 20
    });
  });

  it('shouldShow respects minLevel ordering', () => {
    expect(shouldShow('info', 'info')).toBe(true);
    expect(shouldShow('warn', 'info')).toBe(true);
    expect(shouldShow('error', 'info')).toBe(true);

    expect(shouldShow('info', 'warn')).toBe(false);
    expect(shouldShow('warn', 'warn')).toBe(true);
    expect(shouldShow('error', 'warn')).toBe(true);

    expect(shouldShow('warn', 'error')).toBe(false);
    expect(shouldShow('error', 'error')).toBe(true);
  });
});
