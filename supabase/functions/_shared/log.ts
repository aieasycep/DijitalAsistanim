/**
 * Structured logger with secret/PII redaction. Never log email bodies, tokens, or free text.
 */
const SECRET_KEYS = /token|secret|password|authorization|apikey|api_key|cookie|refresh|access|bodytext|body_text|content|snippet|subject|draft/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[depth]';
  if (typeof value === 'string') {
    if (/^(ya29\.|eyJ|sk-|xoxb|1\/\/)/.test(value) || value.length > 400) return '[redacted]';
    return value.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, message, ts: new Date().toISOString(), ...(meta ? (redact(meta) as Record<string, unknown>) : {}) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit('debug', m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
};
