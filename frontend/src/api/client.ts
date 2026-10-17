/**
 * ManageX Central API Client with Safe Render Free-Tier Cold-Start Handling
 * Adheres strictly to docs/deployment.md, docs/runbook.md, and ADR-018.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  meta?: {
    requestId?: string;
    pagination?: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
    [key: string]: unknown;
  };
  error?: {
    code: string;
    message: string;
    requestId?: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public requestId?: string;
  public details?: Array<{ field: string; message: string }>;
  public isNetworkOrGatewayError: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: string = 'UNKNOWN_ERROR',
    requestId?: string,
    details?: Array<{ field: string; message: string }>,
    isNetworkOrGatewayError: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
    this.isNetworkOrGatewayError = isNetworkOrGatewayError;
  }
}

export type ColdStartStatus = 'idle' | 'waking' | 'failed';

type ColdStartListener = (status: ColdStartStatus, message?: string) => void;
const coldStartListeners: Set<ColdStartListener> = new Set();

export function subscribeToColdStart(listener: ColdStartListener): () => void {
  coldStartListeners.add(listener);
  return () => coldStartListeners.delete(listener);
}

function notifyColdStart(status: ColdStartStatus, message?: string) {
  coldStartListeners.forEach((fn) => fn(status, message));
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  skipColdStartHandling?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/**
 * Polls the unauthenticated health endpoint up to 60 seconds with bounded intervals.
 */
async function pollHealthUntilAwake(maxTimeoutMs: number = 60000, intervalMs: number = 5000): Promise<boolean> {
  const startTime = Date.now();
  notifyColdStart('waking', 'ManageX service is waking up, please wait a moment...');

  while (Date.now() - startTime < maxTimeoutMs) {
    try {
      const probeRes = await fetch(`${API_BASE_URL}/health?probe=coldstart`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });
      if (probeRes.ok) {
        notifyColdStart('idle');
        return true;
      }
    } catch {
      // Continue polling until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  notifyColdStart('failed', 'Service did not respond in time. Please check your network or try again.');
  return false;
}

/**
 * Central fetch wrapper with typed contracts, correlation IDs, and cold-start protection.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> {
  const { params, skipColdStartHandling = false, ...fetchOptions } = options;

  let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const headers = new Headers(fetchOptions.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('Content-Type') && fetchOptions.body && typeof fetchOptions.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const method = (fetchOptions.method || 'GET').toUpperCase();
  const isIdempotentRead = method === 'GET' || method === 'HEAD';

  async function executeRequest(): Promise<Response> {
    return fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'same-origin',
    });
  }

  let response: Response;

  try {
    response = await executeRequest();
  } catch {
    // Network failure (Render asleep or connection dropped)
    if (!skipColdStartHandling && isIdempotentRead) {
      const isAwake = await pollHealthUntilAwake();
      if (isAwake) {
        // Safe to retry idempotent read
        return apiClient<T>(endpoint, { ...options, skipColdStartHandling: true });
      }
    }
    throw new ApiError(
      'Network connection failed or server is unreachable.',
      0,
      'NETWORK_ERROR',
      undefined,
      undefined,
      true
    );
  }

  // Gateway timeout or bad gateway from reverse proxy during cold-start
  if (!skipColdStartHandling && (response.status === 502 || response.status === 504)) {
    if (isIdempotentRead) {
      const isAwake = await pollHealthUntilAwake();
      if (isAwake) {
        // Re-execute safe GET read
        return apiClient<T>(endpoint, { ...options, skipColdStartHandling: true });
      }
    } else {
      // STRICT MUTATION PROTECTION:
      // Never auto-replay a POST/PUT/PATCH/DELETE mutation because the server
      // might have already committed the operation before the proxy disconnected.
      throw new ApiError(
        'The server took longer than expected to respond. The operation may have completed. Please refresh or verify the status before trying again.',
        response.status,
        'GATEWAY_TIMEOUT_MUTATION_UNVERIFIED',
        response.headers.get('x-request-id') || undefined,
        undefined,
        true
      );
    }
  }

  const requestId = response.headers.get('x-request-id') || undefined;

  let body: ApiResponse<T>;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      `Received non-JSON response from server (HTTP ${response.status})`,
      response.status,
      'INVALID_SERVER_RESPONSE',
      requestId
    );
  }

  if (!response.ok || body.success === false) {
    const errorInfo = body.error;
    throw new ApiError(
      errorInfo?.message || `Request failed with status ${response.status}`,
      response.status,
      errorInfo?.code || 'API_ERROR',
      errorInfo?.requestId || requestId,
      errorInfo?.details
    );
  }

  return body;
}
