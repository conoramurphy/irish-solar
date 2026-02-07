export type LogLevel = 'info' | 'warn' | 'error';

export type LogSpanStatus = 'running' | 'success' | 'error';

export interface LogSpan {
  id: string;
  scope: string;
  name: string;
  status: LogSpanStatus;
  startTs: number;
  endTs?: number;
  details?: unknown;
}

export interface LogEntry {
  id: string;
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
  spanId?: string;
  details?: unknown;
}
