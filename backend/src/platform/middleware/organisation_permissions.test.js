import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  requireStrictOrgPermission,
  requireStrictOrgPermissionIfMember,
} from './organisation.js';

const evaluationPermissions = [
  'event.evaluation.view',
  'event.evaluation.manage',
  'event.evaluation.judge.manage',
  'event.evaluation.schedule.manage',
  'event.evaluation.schedule.publish',
];

describe('strict evaluation organisation permissions', () => {
  it('allows each dedicated permission only when explicitly assigned', () => {
    for (const permission of evaluationPermissions) {
      const req = {
        membership: { permissions: new Set([permission]) },
        user: { isPlatformAdmin: false },
      };
      let error;
      requireStrictOrgPermission(permission)(req, {}, (nextError) => {
        error = nextError;
      });
      assert.equal(error, undefined, permission);
    }
  });

  it('denies event-edit access and platform-admin bypass without the dedicated permission', () => {
    const req = {
      membership: { permissions: new Set(['event.edit']) },
      user: { isPlatformAdmin: true },
    };
    let error;
    requireStrictOrgPermission('event.evaluation.manage')(req, {}, (nextError) => {
      error = nextError;
    });
    assert.equal(error?.code, 'FORBIDDEN');
  });

  it('preserves external assignment-scoped requests without membership context', () => {
    const req = { membership: null };
    let called = false;
    requireStrictOrgPermissionIfMember('event.evaluation.view')(req, {}, (error) => {
      called = true;
      assert.equal(error, undefined);
    });
    assert.equal(called, true);
  });
});
