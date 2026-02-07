import { create } from 'zustand';
import type { LogEntry, LogLevel, LogSpan, LogSpanStatus } from '../types/logging';

function makeId(): string {
  // Good enough for UI list keys.
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface LogStoreState {
  entries: LogEntry[];
  spans: Record<string, LogSpan>;
  minLevel: LogLevel;
  setMinLevel: (level: LogLevel) => void;
  add: (entry: Omit<LogEntry, 'id' | 'ts'>) => void;
  startSpan: (span: { scope: string; name: string; details?: unknown }) => string;
  endSpan: (spanId: string, status: LogSpanStatus, details?: unknown) => void;
  clear: () => void;
}

export const useLogStore = create<LogStoreState>((set, get) => ({
  entries: [],
  spans: {},
  minLevel: 'info',
  setMinLevel: (level) => set({ minLevel: level }),
  add: (entry) =>
    set((state) => ({
      entries: [
        {
          id: makeId(),
          ts: Date.now(),
          ...entry
        },
        ...state.entries
      ].slice(0, 2000) // cap memory
    })),
  startSpan: ({ scope, name, details }) => {
    const id = makeId();
    const startTs = Date.now();
    set((state) => ({
      spans: {
        ...state.spans,
        [id]: {
          id,
          scope,
          name,
          status: 'running',
          startTs,
          details
        }
      }
    }));
    return id;
  },
  endSpan: (spanId, status, details) => {
    const existing = get().spans[spanId];
    if (!existing) return;

    set((state) => ({
      spans: {
        ...state.spans,
        [spanId]: {
          ...existing,
          status,
          endTs: Date.now(),
          details: details ?? existing.details
        }
      }
    }));
  },
  clear: () => set({ entries: [], spans: {} })
}));

export function shouldShow(level: LogLevel, minLevel: LogLevel): boolean {
  const order: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };
  return order[level] >= order[minLevel];
}
