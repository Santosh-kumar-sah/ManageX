import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { projectSessionForCaller } from './evaluationService.js';

describe('evaluation session projection', () => {
  it('redacts meeting links for cancelled and no-show sessions', () => {
    for (const status of ['cancelled', 'no_show']) {
      const projected = projectSessionForCaller(
        {
          id: 'session-1',
          status,
          meeting_url: 'https://meet.managex.local/session-1',
          starts_at: new Date('2027-01-01T10:00:00.000Z'),
          ends_at: new Date('2027-01-01T10:15:00.000Z'),
        },
        { isOrganiser: true }
      );

      assert.equal(projected.meetingUrl, null, status);
    }
  });
});
