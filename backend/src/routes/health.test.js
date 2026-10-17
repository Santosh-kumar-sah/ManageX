import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Backend Foundation & Probes API', () => {
  const app = createApp();

  test('GET /api/v1/health returns 200 with standard success envelope', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ok');
    assert.ok(typeof res.body.data.uptimeSeconds === 'number');
    assert.ok(res.body.meta.requestId);
    assert.equal(res.headers['x-request-id'], res.body.meta.requestId);
  });

  test('GET /api/v1/health preserves custom incoming X-Request-Id', async () => {
    const customId = 'custom-test-correlation-id-12345';
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-Id', customId)
      .expect(200);

    assert.equal(res.headers['x-request-id'], customId);
    assert.equal(res.body.meta.requestId, customId);
  });

  test('GET /api/v1/health with invalid query param triggers Zod 422 error', async () => {
    const res = await request(app)
      .get('/api/v1/health?verbose=notabool')
      .expect(422);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.body.error.details));
    assert.equal(res.body.error.details[0].field, 'verbose');
  });

  test('GET /api/v1/ready returns 200 with readiness status', async () => {
    const res = await request(app)
      .get('/api/v1/ready')
      .expect(200);

    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'ready');
    assert.equal(res.body.data.database, 'connected');
  });

  test('GET /api/v1/unmatched-route returns 404 with standard error envelope', async () => {
    const res = await request(app)
      .get('/api/v1/unmatched-route')
      .expect(404);

    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.ok(res.body.error.message.includes('does not exist'));
    assert.ok(res.body.error.requestId);
  });
});
