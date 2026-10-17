const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /authorization/i,
  /cookie/i,
  /session/i,
  /key/i,
  /credentials/i,
];

/**
 * Deeply redacts sensitive keys from log payloads.
 */
export function redactSecrets(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map(redactSecrets);
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSecrets(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Express middleware for structured HTTP request/response logging.
 */
export function httpLoggerMiddleware(req, res, next) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number((endTime - startTime) / 1_000_000n);

    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    // In testing mode, reduce console noise unless explicitly enabled
    if (process.env.NODE_ENV !== 'test') {
      const output = JSON.stringify(logEntry);
      if (res.statusCode >= 500) {
        console.error(output);
      } else if (res.statusCode >= 400) {
        console.warn(output);
      } else {
        console.log(output);
      }
    }
  });

  next();
}

/**
 * Structured application logger with automatic secret redaction.
 */
export const logger = {
  info(obj, message) {
    if (process.env.NODE_ENV !== 'test') {
      const payload = typeof obj === 'string' ? { message: obj } : { ...redactSecrets(obj), message };
      console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', ...payload }));
    }
  },
  warn(obj, message) {
    const payload = typeof obj === 'string' ? { message: obj } : { ...redactSecrets(obj), message };
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', ...payload }));
  },
  error(obj, message) {
    const payload = typeof obj === 'string' ? { message: obj } : { ...redactSecrets(obj), message };
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', ...payload }));
  },
  debug(obj, message) {
    if (process.env.NODE_ENV === 'development') {
      const payload = typeof obj === 'string' ? { message: obj } : { ...redactSecrets(obj), message };
      console.debug(JSON.stringify({ timestamp: new Date().toISOString(), level: 'debug', ...payload }));
    }
  },
};

