import { ZodError } from 'zod';
import { errorResponse } from '../common/responses.js';
import { AppError } from '../common/errors.js';

/**
 * Central Express error-handling middleware.
 * Adheres to docs/api-contracts.md error response shape.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const requestId = req.id;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    return res.status(422).json(
      errorResponse({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        requestId,
        details,
      })
    );
  }

  // Handle malformed JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json(
      errorResponse({
        code: 'INVALID_JSON',
        message: 'The request body contains invalid JSON.',
        requestId,
      })
    );
  }

  // Handle invalid Unicode or null byte sequences (SEC-002)
  if (err.code === '22021' || (err.message && err.message.includes('invalid byte sequence'))) {
    return res.status(400).json(
      errorResponse({
        code: 'INVALID_ENCODING',
        message: 'The request contains invalid characters or null bytes.',
        requestId,
      })
    );
  }

  // Handle oversized request payloads (SEC-006)
  if (err.status === 413 || err.type === 'entity.too.large') {
    return res.status(413).json(
      errorResponse({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request payload exceeds the maximum allowed size (100KB).',
        requestId,
      })
    );
  }

  // Handle custom AppError instances
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(
      errorResponse({
        code: err.code,
        message: err.message,
        requestId,
        details: err.details,
      })
    );
  }

  // Log unexpected errors
  if (process.env.NODE_ENV !== 'test') {
    console.error('Unhandled internal error:', {
      requestId,
      message: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    });
  }

  // Default internal server error (never leak raw stack or SQL in production)
  const isProduction = process.env.NODE_ENV === 'production';
  return res.status(500).json(
    errorResponse({
      code: 'INTERNAL_SERVER_ERROR',
      message: isProduction
        ? 'An unexpected error occurred. Please try again later.'
        : err.message || 'An unexpected error occurred.',
      requestId,
    })
  );
}
