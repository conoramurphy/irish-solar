import { useMemo, useState } from 'react';
import { useLogStore, shouldShow } from '../stores/logStore';
import type { LogLevel, LogSpan } from '../types/logging';

function formatTs(ts: number) {
  return new Date(ts).toLocaleString();
}

function formatDurationMs(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60_000).toFixed(2)}m`;
}

function levelBadge(level: LogLevel) {
  const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold';
  switch (level) {
    case 'error':
      return `${base} bg-red-100 text-red-800`;
    case 'warn':
      return `${base} bg-amber-100 text-amber-800`;
    case 'info':
    default:
      return `${base} bg-slate-100 text-slate-700`;
  }
}

export function LogViewer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { entries, spans, minLevel, setMinLevel, clear } = useLogStore();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (!shouldShow(e.level, minLevel)) return false;
      if (!q) return true;
      const hay = `${e.scope} ${e.message}`.toLowerCase();
      return hay.includes(q);
    });
  }, [entries, minLevel, query]);

  const filteredSpans = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bySpan = new Map<string, number>();
    for (const e of filteredEntries) {
      if (e.spanId) bySpan.set(e.spanId, (bySpan.get(e.spanId) ?? 0) + 1);
    }

    const list: Array<{ span: LogSpan; matchCount: number }> = [];
    for (const id of Object.keys(spans)) {
      const span = spans[id];
      const matchCount = bySpan.get(id) ?? 0;
      if (matchCount > 0) {
        list.push({ span, matchCount });
        continue;
      }

      // If no entries match, still include the span if the span name matches the query.
      if (q && `${span.scope} ${span.name}`.toLowerCase().includes(q)) {
        list.push({ span, matchCount: 0 });
      }
    }

    // Newest spans first.
    list.sort((a, b) => b.span.startTs - a.span.startTs);
    return list;
  }, [filteredEntries, spans, query]);

  const ungroupedEntries = useMemo(() => filteredEntries.filter((e) => !e.spanId), [filteredEntries]);

  const selected = useMemo(() => {
    return filteredEntries.find((e) => e.id === selectedId) ?? null;
  }, [filteredEntries, selectedId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-950/60" onClick={onClose} />
      <div className="absolute inset-4 md:inset-8 rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-200">
          <div>
            <h2 className="text-2xl font-serif font-bold text-slate-900">Activity Log</h2>
            <p className="text-sm text-slate-500 mt-1">Click entries to inspect details. This is read-only.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={clear}
            >
              Clear
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
          <input
            className="rounded-md border-slate-300 text-sm"
            placeholder="Filter (scope/message)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedId(null);
            }}
          />

          <div className="inline-flex items-center gap-2 text-sm">
            <span className="text-slate-600">Min level</span>
            <select
              className="rounded-md border-slate-300 text-sm"
              value={minLevel}
              onChange={(e) => setMinLevel(e.target.value as LogLevel)}
            >
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </div>

          <div className="ml-auto text-xs text-slate-500">Showing {filteredEntries.length.toLocaleString()} entries</div>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
          <div className="border-r border-slate-100 overflow-auto">
            <ul className="divide-y divide-slate-100">
              {filteredSpans.map(({ span }) => {
                const spanEntries = filteredEntries.filter((e) => e.spanId === span.id);
                const duration = span.endTs ? span.endTs - span.startTs : Date.now() - span.startTs;
                const statusBadge =
                  span.status === 'error'
                    ? 'bg-red-100 text-red-800'
                    : span.status === 'success'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700';

                return (
                  <li key={span.id} className="px-4 py-2">
                    <details className="group" open>
                      <summary className="list-none cursor-pointer rounded-md px-2 py-2 hover:bg-slate-50 flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-slate-500">{formatTs(span.startTs)} · {span.scope}</div>
                          <div className="text-sm font-semibold text-slate-900 mt-1">
                            {span.name}
                            <span className="ml-2 text-xs font-normal text-slate-500">({formatDurationMs(duration)})</span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusBadge}`}>{span.status}</span>
                      </summary>

                      <ul className="mt-2 ml-2 border-l border-slate-200">
                        {spanEntries.map((e) => (
                          <li key={e.id}>
                            <button
                              type="button"
                              className={`w-full text-left px-4 py-2 hover:bg-slate-50 ${selectedId === e.id ? 'bg-slate-50' : ''}`}
                              onClick={() => setSelectedId(e.id)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-[11px] text-slate-500">{formatTs(e.ts)}</div>
                                  <div className="text-sm font-medium text-slate-900 mt-0.5">{e.message}</div>
                                </div>
                                <span className={levelBadge(e.level)}>{e.level}</span>
                              </div>
                            </button>
                          </li>
                        ))}
                        {spanEntries.length === 0 && (
                          <li className="px-4 py-3 text-sm text-slate-500">No entries in this span match the current filter.</li>
                        )}
                      </ul>
                    </details>
                  </li>
                );
              })}

              {ungroupedEntries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={`w-full text-left px-6 py-3 hover:bg-slate-50 ${selectedId === e.id ? 'bg-slate-50' : ''}`}
                    onClick={() => setSelectedId(e.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-500">{formatTs(e.ts)} · {e.scope}</div>
                        <div className="text-sm font-medium text-slate-900 mt-1">{e.message}</div>
                      </div>
                      <span className={levelBadge(e.level)}>{e.level}</span>
                    </div>
                  </button>
                </li>
              ))}

              {filteredEntries.length === 0 && (
                <li className="px-6 py-8 text-sm text-slate-500">No log entries match the current filter.</li>
              )}
            </ul>
          </div>

          <div className="overflow-auto">
            {!selected ? (
              <div className="p-6 text-sm text-slate-500">Select a log entry to see details.</div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-500">{formatTs(selected.ts)} · {selected.scope}</div>
                    <div className="text-lg font-semibold text-slate-900 mt-1">{selected.message}</div>
                  </div>
                  <span className={levelBadge(selected.level)}>{selected.level}</span>
                </div>

                <div className="mt-4">
                  <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">Details</h3>
                  <pre className="mt-2 rounded-md bg-slate-950 text-slate-100 p-4 text-xs overflow-auto">
{JSON.stringify(selected.details ?? null, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
