import { errorResponse } from '../common/responses.js';

/**
 * Catches unmatched routes and returns a standard 404 JSON response.
 */
export function notFoundHandler(req, res) {
  res.status(404).json(
    errorResponse({
      code: 'NOT_FOUND',
      message: `The requested resource '${req.method} ${req.originalUrl}' does not exist.`,
      requestId: req.id,
    })
  );
}
