import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePanelDate } from './locationStatus.js';

test('interprets timezone-less panel timestamps as UTC', () => {
  assert.equal(
    parsePanelDate('2026-09-07T23:24:47').toISOString(),
    '2026-09-07T23:24:47.000Z',
  );
});

test('preserves timestamps that already include a timezone', () => {
  assert.equal(
    parsePanelDate('2026-09-07T20:24:47+00:00').toISOString(),
    '2026-09-07T20:24:47.000Z',
  );
});
