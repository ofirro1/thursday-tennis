import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldReload } from './version.js';

test('reload once when a newer deploy is published', () => {
  assert.equal(shouldReload({ build: 'aaa111', remote: 'bbb222', already: '', pending: false }), true);
  assert.equal(shouldReload({ build: 'bbb222', remote: 'bbb222', already: '', pending: false }), false);
  assert.equal(shouldReload({ build: 'aaa111', remote: 'bbb222', already: 'bbb222', pending: false }), false);
  assert.equal(shouldReload({ build: 'aaa111', remote: 'bbb222', already: '', pending: true }), false);
  assert.equal(shouldReload({ build: 'dev', remote: 'bbb222', already: '', pending: false }), false);
  assert.equal(shouldReload({ build: '__VERSION__', remote: 'bbb222', already: '', pending: false }), false);
  assert.equal(shouldReload({ build: 'aaa111', remote: '', already: '', pending: false }), false);
});
