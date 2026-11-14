import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApi } from './api.js';
import { createStore } from './memory-store.js';

const NOW = new Date('2026-11-14T00:00:00.000Z');
const PIN = '246810';

function call(store, path, { method = 'GET', body, token, ip } = {}) {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (ip) headers.set('x-test-ip', ip);
  return handleApi(new Request(`http://local${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }), {
    store,
    bootstrapPin: PIN,
    now: () => NOW,
  });
}

async function bodyOf(response) {
  return { status: response.status, body: await response.json() };
}

test('shared state starts with the six players and no history', async () => {
  const store = createStore();
  const { status, body } = await bodyOf(await call(store, '/api/state'));
  assert.equal(status, 200);
  assert.deepEqual(body.players.map((player) => player.name), ['Chris', 'Gordon', 'John', 'Mick', 'Carlton', 'Ofir']);
  assert.equal(body.responses.length, 0);
  assert.equal(body.weeks.length, 0);
  assert.equal(body.corrections.length, 0);
  assert.equal(body.pin, undefined);
  assert.equal(body.serverTime, NOW.toISOString());
});

test('a player can mark in, and a finished week is rejected', async () => {
  const store = createStore();
  const saved = await bodyOf(await call(store, '/api/responses', {
    method: 'POST',
    body: { playerId: 'gordon', week: '2026-11-19', status: 'in' },
  }));
  assert.equal(saved.status, 200);
  const state = await bodyOf(await call(store, '/api/state'));
  assert.deepEqual(state.body.responses, [{ week: '2026-11-19', playerId: 'gordon', status: 'in', updatedAt: NOW.toISOString() }].map((row) => ({
    week: row.week, playerId: row.playerId, status: row.status,
  })));

  const closed = await bodyOf(await call(store, '/api/responses', {
    method: 'POST',
    body: { playerId: 'gordon', week: '2026-11-12', status: 'in' },
  }));
  assert.equal(closed.status, 400);
  assert.match(closed.body.error, /finished/i);
});

test('cancelling a week blocks answers', async () => {
  const store = createStore();
  const token = await login(store);
  const cancelled = await bodyOf(await call(store, '/api/admin/week', {
    method: 'POST',
    token,
    body: { week: '2026-11-19', cancelled: true, reason: 'Rain' },
  }));
  assert.equal(cancelled.status, 200);
  const answer = await bodyOf(await call(store, '/api/responses', {
    method: 'POST',
    body: { playerId: 'chris', week: '2026-11-19', status: 'in' },
  }));
  assert.equal(answer.status, 400);
  assert.match(answer.body.error, /No tennis/);
});

test('past weeks and the PIN stay behind the admin PIN', async () => {
  const store = createStore();
  const denied = await bodyOf(await call(store, '/api/admin/week', {
    method: 'POST',
    body: { week: '2026-11-19', cancelled: true, reason: 'Rain' },
  }));
  assert.equal(denied.status, 401);

  const token = await login(store);
  const names = await bodyOf(await call(store, '/api/state'));
  assert.deepEqual(names.body.players.map((player) => player.name), ['Chris', 'Gordon', 'John', 'Mick', 'Carlton', 'Ofir']);

  const tooSoon = await bodyOf(await call(store, '/api/admin/correction', {
    method: 'POST',
    token,
    body: { week: '2026-11-19', outcomes: {} },
  }));
  assert.equal(tooSoon.status, 400);

  const outcomes = {
    chris: 'played', gordon: 'played', john: 'played', mick: 'sat_out', carlton: 'unavailable', ofir: 'unanswered',
  };
  const fixed = await bodyOf(await call(store, '/api/admin/correction', {
    method: 'POST',
    token,
    body: { week: '2026-11-12', outcomes },
  }));
  assert.equal(fixed.status, 200);
  const after = await bodyOf(await call(store, '/api/state'));
  assert.equal(after.body.corrections.length, 6);
  assert.equal(after.body.weeks[0].corrected, true);
});

test('five wrong PINs lock that phone, not a different one', async () => {
  const store = createStore();
  for (let i = 0; i < 5; i += 1) {
    const wrong = await bodyOf(await call(store, '/api/admin/login', {
      method: 'POST',
      ip: 'other-phone',
      body: { pin: '111111' },
    }));
    assert.equal(wrong.status, 401);
  }
  const locked = await bodyOf(await call(store, '/api/admin/login', {
    method: 'POST',
    ip: 'other-phone',
    body: { pin: PIN },
  }));
  assert.equal(locked.status, 423);
  const ofir = await bodyOf(await call(store, '/api/admin/login', {
    method: 'POST',
    ip: 'ofir-phone',
    body: { pin: PIN },
  }));
  assert.equal(ofir.status, 200);
  assert.match(ofir.body.token, /^[a-f0-9]{48}$/);

  const changed = await bodyOf(await call(store, '/api/admin/pin', {
    method: 'POST',
    token: ofir.body.token,
    ip: 'ofir-phone',
    body: { pin: '135790' },
  }));
  assert.equal(changed.status, 200);
  const oldPin = await bodyOf(await call(store, '/api/admin/login', {
    method: 'POST',
    ip: 'ofir-phone',
    body: { pin: PIN },
  }));
  assert.equal(oldPin.status, 401);
  const newPin = await bodyOf(await call(store, '/api/admin/login', {
    method: 'POST',
    ip: 'ofir-phone',
    body: { pin: '135790' },
  }));
  assert.equal(newPin.status, 200);
});

async function login(store) {
  const response = await bodyOf(await call(store, '/api/admin/login', {
    method: 'POST',
    ip: 'ofir-phone',
    body: { pin: PIN },
  }));
  assert.equal(response.status, 200);
  return response.body.token;
}
