export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  /** Create a child logger that merges `bindings` into every log entry. */
  child(bindings: LogContext): Logger;
}

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};

/**
 * Minimal JSON-line logger to stdout/stderr. Suitable for development and
 * containerized environments. For production prefer wiring a real logger
 * (pino, winston) by implementing the `Logger` interface.
 */
export function consoleLogger(bindings: LogContext = {}): Logger {
  const emit = (level: LogLevel, message: string, context?: LogContext): void => {
    const entry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...bindings,
      ...context,
    };
    const line = JSON.stringify(entry);
    if (level === 'error' || level === 'warn') {
      console.error(line);
    } else {
      console.log(line);
    }
  };
  return {
    debug: (m, c) => emit('debug', m, c),
    info: (m, c) => emit('info', m, c),
    warn: (m, c) => emit('warn', m, c),
    error: (m, c) => emit('error', m, c),
    child: (b) => consoleLogger({ ...bindings, ...b }),
  };
}
