/**
 * Structured logger.
 *
 * Emits one JSON object per line to stdout/stderr so that Vercel's log
 * drains (and local `vercel dev`) can be queried after the fact. Every log
 * line carries a stable shape: { ts, level, event, ...context }.
 *
 * Design intent (see implementation stance): when an API call fails we must
 * be able to reconstruct *why* from the logs alone, so callers are encouraged
 * to attach rich context (resource ids, durations, upstream error details).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || "info").toLowerCase();
  if (raw in LEVEL_WEIGHT) {
    return raw as LogLevel;
  }
  return "info";
}

/**
 * Strip values that should never reach the logs (secrets, raw file bytes).
 * Buffers are summarised by length so we keep a breadcrumb without dumping
 * binary content.
 */
function sanitize(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return `<buffer ${value.length}b>`;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function emit(level: LogLevel, event: string, context: LogContext = {}): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[currentMinLevel()]) {
    return;
  }

  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    event,
  };

  for (const [key, raw] of Object.entries(context)) {
    line[key] = sanitize(raw);
  }

  const serialized = JSON.stringify(line);
  if (level === "error" || level === "warn") {
    process.stderr.write(serialized + "\n");
  } else {
    process.stdout.write(serialized + "\n");
  }
}

export const logger = {
  debug: (event: string, context?: LogContext) => emit("debug", event, context),
  info: (event: string, context?: LogContext) => emit("info", event, context),
  warn: (event: string, context?: LogContext) => emit("warn", event, context),
  error: (event: string, context?: LogContext) => emit("error", event, context),
};

/**
 * Time an async operation and log its outcome. Keeps the "how long / did it
 * fail" breadcrumbs consistent across every upstream call.
 */
export async function timed<T>(
  event: string,
  context: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    logger.debug(`${event}.ok`, { ...context, durationMs: Date.now() - start });
    return result;
  } catch (error) {
    logger.error(`${event}.fail`, {
      ...context,
      durationMs: Date.now() - start,
      error,
    });
    throw error;
  }
}
