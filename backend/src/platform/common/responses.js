/**
 * Formats a standardized JSON success response.
 * Adheres to docs/api-contracts.md Section 2.
 *
 * @param {object} options
 * @param {any} [options.data=null] - The payload data
 * @param {string} [options.requestId] - Unique request correlation ID
 * @param {object} [options.pagination] - Server-side pagination metadata
 * @param {object} [options.extraMeta] - Additional safe metadata
 * @returns {object} Standardized success envelope
 */
export function successResponse({ data = null, requestId, pagination, extraMeta = {} } = {}) {
  const meta = {
    ...(requestId ? { requestId } : {}),
    ...(pagination ? { pagination } : {}),
    ...extraMeta,
  };

  return {
    success: true,
    data,
    meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

/**
 * Formats a standardized JSON error response.
 * Adheres to docs/api-contracts.md Section 2.
 *
 * @param {object} options
 * @param {string} options.code - Machine-readable error code (e.g. VALIDATION_ERROR, NOT_FOUND)
 * @param {string} options.message - Human-readable safe message
 * @param {string} [options.requestId] - Unique request correlation ID
 * @param {any} [options.details] - Safe field-level error details (e.g. Zod issues)
 * @returns {object} Standardized error envelope
 */
export function errorResponse({ code, message, requestId, details } = {}) {
  return {
    success: false,
    error: {
      code,
      message,
      ...(requestId ? { requestId } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}
