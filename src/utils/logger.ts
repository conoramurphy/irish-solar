import { useLogStore } from '../stores/logStore';
import type { LogLevel, LogSpanStatus } from '../types/logging';

function safeSerialize(details: unknown): unknown {
  try {
    // Ensure we don't crash on circular structures.
    return JSON.parse(JSON.stringify(details));
  } catch {
    return String(details);
  }
}

export type LogOptions = {
  spanId?: string;
};

export function log(scope: string, level: LogLevel, message: string, details?: unknown, options?: LogOptions) {
  // Console logging for debugging
  const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  const prefix = `[${scope.toUpperCase()}]`;
  if (details) {
    logFn(prefix, message, details);
  } else {
    logFn(prefix, message);
  }

  // Keep internal store for now (in case other things use it, though we removed Viewer)
  useLogStore.getState().add({
    scope,
    level,
    message,
    spanId: options?.spanId,
    details: details === undefined ? undefined : safeSerialize(details)
  });
}

export const logInfo = (scope: string, message: string, details?: unknown, options?: LogOptions) =>
  log(scope, 'info', message, details, options);

export const logWarn = (scope: string, message: string, details?: unknown, options?: LogOptions) =>
  log(scope, 'warn', message, details, options);

export const logError = (scope: string, message: string, details?: unknown, options?: LogOptions) =>
  log(scope, 'error', message, details, options);

export function startSpan(scope: string, name: string, details?: unknown): string {
  return useLogStore.getState().startSpan({ scope, name, details: details === undefined ? undefined : safeSerialize(details) });
}

export function endSpan(spanId: string, status: LogSpanStatus, details?: unknown) {
  useLogStore.getState().endSpan(spanId, status, details === undefined ? undefined : safeSerialize(details));
}
