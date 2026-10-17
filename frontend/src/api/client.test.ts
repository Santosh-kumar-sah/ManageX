import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient, ApiError, subscribeToColdStart, type ColdStartStatus } from './client';

describe('Central API Client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('successfully returns data on 200 JSON response', async () => {
    const mockPayload = { success: true, data: { status: 'ok' }, meta: { requestId: 'req-123' } };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': 'req-123' }),
      json: async () => mockPayload,
    });

    const result = await apiClient<{ status: string }>('/health', { skipColdStartHandling: true });
    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('ok');
    expect(result.meta?.requestId).toBe('req-123');
  });

  it('throws structured ApiError when backend returns 422 validation failure', async () => {
    const mockError = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        requestId: 'req-err-456',
        details: [{ field: 'email', message: 'Invalid email' }],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': 'req-err-456' }),
      json: async () => mockError,
    });

    await expect(apiClient('/test', { skipColdStartHandling: true })).rejects.toThrow(ApiError);

    try {
      await apiClient('/test', { skipColdStartHandling: true });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(422);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.requestId).toBe('req-err-456');
      expect(apiErr.details?.[0].field).toBe('email');
    }
  });

  it('STRICT MUTATION PROTECTION: throws GATEWAY_TIMEOUT_MUTATION_UNVERIFIED on 502/504 for POST/PUT without auto-retry', async () => {
    // A 504 on a mutation (POST) must NEVER be auto-replayed
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      headers: new Headers({ 'X-Request-Id': 'proxy-timeout-789' }),
      json: async () => ({}),
    });

    await expect(
      apiClient('/organisations/org-1/events', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Event' }),
      })
    ).rejects.toThrow(ApiError);

    try {
      await apiClient('/organisations/org-1/events', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Event' }),
      });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(504);
      expect(apiErr.code).toBe('GATEWAY_TIMEOUT_MUTATION_UNVERIFIED');
      expect(apiErr.message).toContain('The operation may have completed');
    }
  });

  it('1. Polling timeout: simulates expiration of 60s polling limit, triggering failed notification and NETWORK_ERROR', async () => {
    vi.useFakeTimers();
    const statusTransitions: Array<{ status: ColdStartStatus; message?: string }> = [];
    const unsubscribe = subscribeToColdStart((status, message) => {
      statusTransitions.push({ status, message });
    });

    // Mock fetch: initial GET fails with network error, and health probes continually fail with 503
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/health')) {
        return { ok: false, status: 503, headers: new Headers() } as Response;
      }
      throw new TypeError('Failed to fetch');
    });

    let capturedError: ApiError | null = null;
    const requestPromise = apiClient('/test-timeout', { method: 'GET' }).catch((err) => {
      capturedError = err as ApiError;
    });

    // Advance virtual time by 65,000ms in steps to allow all 5,000ms polling intervals to execute
    await vi.advanceTimersByTimeAsync(65000);
    await requestPromise;

    expect(capturedError).not.toBeNull();
    const networkErr = capturedError as unknown as ApiError;
    expect(networkErr).toBeInstanceOf(ApiError);
    expect(networkErr.statusCode).toBe(0);
    expect(networkErr.code).toBe('NETWORK_ERROR');
    expect(networkErr.isNetworkOrGatewayError).toBe(true);

    expect(statusTransitions.some((t) => t.status === 'waking')).toBe(true);
    expect(statusTransitions.some((t) => t.status === 'failed')).toBe(true);

    unsubscribe();
  });

  it('2. Successful GET retry: retries idempotent GET once after 502/504 and successful health probe', async () => {
    let endpointCallCount = 0;
    const healthProbeMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ success: true, data: { status: 'ok' } }),
    });

    const dataPayload = { success: true, data: { items: ['event-1', 'event-2'] } };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/health?probe=coldstart')) {
        return healthProbeMock();
      }
      endpointCallCount++;
      if (endpointCallCount === 1) {
        // First attempt fails with 502 Bad Gateway (Render sleeping)
        return {
          ok: false,
          status: 502,
          headers: new Headers({ 'X-Request-Id': 'cold-502' }),
          json: async () => ({}),
        } as Response;
      }
      // Second attempt (the single retry) succeeds
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json', 'X-Request-Id': 'retry-200' }),
        json: async () => dataPayload,
      } as Response;
    });

    const result = await apiClient<{ items: string[] }>('/events', { method: 'GET' });
    expect(result.success).toBe(true);
    expect(result.data?.items).toEqual(['event-1', 'event-2']);
    expect(endpointCallCount).toBe(2); // exactly 1 initial + 1 retry
    expect(healthProbeMock).toHaveBeenCalledTimes(1);
  });

  it('3. Cold-start listener transitions: emits waking and idle on recovery, and waking and failed on timeout', async () => {
    // Sub-scenario A: waking -> idle on recovery
    const transitionsA: ColdStartStatus[] = [];
    const unsubA = subscribeToColdStart((status) => transitionsA.push(status));

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/health')) {
        return { ok: true, status: 200 } as Response;
      }
      if (transitionsA.length === 0) {
        return { ok: false, status: 504, headers: new Headers() } as Response;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ success: true, data: { status: 'recovered' } }),
      } as Response;
    });

    await apiClient('/status-check');
    expect(transitionsA).toEqual(['waking', 'idle']);
    unsubA();

    // Sub-scenario B: waking -> failed on timeout
    vi.useFakeTimers();
    const transitionsB: ColdStartStatus[] = [];
    const unsubB = subscribeToColdStart((status) => transitionsB.push(status));

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      throw new TypeError('Service Unavailable');
    });

    let capturedErrB: ApiError | null = null;
    const promiseB = apiClient('/timeout-check').catch((err) => {
      capturedErrB = err as ApiError;
    });
    await vi.advanceTimersByTimeAsync(65000);
    await promiseB;

    expect(capturedErrB).toBeInstanceOf(ApiError);

    expect(transitionsB).toEqual(['waking', 'failed']);
    unsubB();
  });

  it('4. Mutation network failure: failed POST rejects with NETWORK_ERROR without entering polling loop or replaying', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Network connection lost'));
    globalThis.fetch = fetchMock;

    const coldStartListener = vi.fn();
    const unsubscribe = subscribeToColdStart(coldStartListener);

    await expect(
      apiClient('/organisations/org-1/events', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Hackathon' }),
      })
    ).rejects.toThrow(ApiError);

    try {
      await apiClient('/organisations/org-1/events', {
        method: 'POST',
        body: JSON.stringify({ name: 'New Hackathon' }),
      });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(0);
      expect(apiErr.code).toBe('NETWORK_ERROR');
      expect(apiErr.isNetworkOrGatewayError).toBe(true);
    }

    // Exactly 2 calls (one per apiClient invocation in this test), NEVER retried internally
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Zero cold-start health probes triggered
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/health'), expect.anything());
    // Cold-start listener never woken
    expect(coldStartListener).not.toHaveBeenCalled();

    unsubscribe();
  });

  it('5. Non-JSON server response: malformed or HTML response produces INVALID_SERVER_RESPONSE', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ 'Content-Type': 'text/html', 'X-Request-Id': 'html-err-1' }),
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON at position 0');
      },
    });

    await expect(apiClient('/html-error', { skipColdStartHandling: true })).rejects.toThrow(ApiError);

    try {
      await apiClient('/html-error', { skipColdStartHandling: true });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(500);
      expect(apiErr.code).toBe('INVALID_SERVER_RESPONSE');
      expect(apiErr.requestId).toBe('html-err-1');
      expect(apiErr.message).toContain('Received non-JSON response from server (HTTP 500)');
    }
  });
});
