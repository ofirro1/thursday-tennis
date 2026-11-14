import { isThursday, nextThursdays, phase } from './logic.js';
import { hashPin, pinsMatch, randomHex } from './pin.js';

const OUTCOMES = new Set(['played', 'sat_out', 'unavailable', 'unanswered']);
const LOCK_MS = 15 * 60 * 1000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Authorization',
    'access-control-max-age': '86400',
  };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...corsHeaders(),
    },
  });
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 20000) throw new HttpError(400, 'That was too large.');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Something was wrong with that. Try again.');
  }
}

function clientIp(request) {
  const header = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Test-IP') || 'local';
  return header.slice(0, 80);
}

function cleanReason(input) {
  const reason = String(input || '').replace(/[\u0000-\u001f]/g, '').trim();
  if (reason.length > 60) throw new HttpError(400, 'Keep the reason short.');
  if (reason && !/^[A-Za-z0-9][A-Za-z0-9 .,''\-]*$/.test(reason)) {
    throw new HttpError(400, 'Use a short reason like Rain or Chris away.');
  }
  return reason;
}

function cleanPin(input) {
  const pin = String(input || '').trim();
  if (!/^[0-9]{6,8}$/.test(pin)) throw new HttpError(400, 'The PIN should be 6 to 8 numbers.');
  return pin;
}

async function requireAdmin(request, store, now) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!/^[a-f0-9]{48}$/.test(token)) throw new HttpError(401, 'Enter the PIN again.');
  const session = await store.getSession(token);
  if (!session || session.expiresAt <= now.toISOString()) throw new HttpError(401, 'Enter the PIN again.');
  return token;
}

async function login(body, store, bootstrapPin, request, now) {
  const pin = cleanPin(body.pin);
  const ip = clientIp(request);
  const attempt = await store.getAttempt(ip);
  if (attempt.lockedUntil && attempt.lockedUntil > now.toISOString()) {
    throw new HttpError(423, 'Too many tries from this phone. Wait 15 minutes.');
  }

  let saved = await store.getPin();
  let ok = false;
  if (!saved) {
    if (!/^[0-9]{6,8}$/.test(bootstrapPin || '')) {
      throw new HttpError(500, 'The admin PIN is not set up yet. It should be 6 to 8 numbers.');
    }
    const salt = randomHex(16);
    const expected = await hashPin(bootstrapPin, salt);
    const actual = await hashPin(pin, salt);
    ok = pinsMatch(expected, actual);
    if (ok) await store.savePin({ salt, hash: expected });
  } else {
    ok = pinsMatch(await hashPin(pin, saved.salt), saved.hash);
  }

  if (!ok) {
    const failures = (attempt.failures || 0) + 1;
    await store.saveAttempt(ip, {
      failures: failures >= 5 ? 0 : failures,
      lockedUntil: failures >= 5 ? new Date(now.getTime() + LOCK_MS).toISOString() : null,
    });
    throw new HttpError(401, 'That PIN is not right.');
  }

  await store.saveAttempt(ip, { failures: 0, lockedUntil: null });
  await store.deleteExpiredSessions(now.toISOString());
  const token = randomHex(24);
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await store.saveSession(token, expiresAt);
  return { ok: true, token };
}

async function saveWeek(body, store, now) {
  const week = String(body.week || '');
  if (!isThursday(week)) throw new HttpError(400, 'Pick a Thursday.');
  const parts = week.split('-').map(Number);
  const weekUtc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
  const today = now.getTime();
  if (weekUtc < today - 400 * 24 * 60 * 60 * 1000 || weekUtc > today + 200 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, 'That Thursday is too far away.');
  }
  await store.setCancelled(week, !!body.cancelled, cleanReason(body.reason));
  return { ok: true };
}

async function saveCorrection(body, store, now) {
  const week = String(body.week || '');
  if (!isThursday(week)) throw new HttpError(400, 'Pick a Thursday.');
  if (phase(week, now) !== 'closed') throw new HttpError(400, 'You can fix a week after it has finished.');
  const state = await store.getState();
  const meta = state.weeks.find((row) => row.week === week);
  if (body.clear) {
    await store.clearCorrections(week);
    return { ok: true };
  }
  if (meta?.cancelled) throw new HttpError(400, 'This week is cancelled. Turn tennis back on first.');
  const outcomes = body.outcomes || {};
  const clean = {};
  for (const player of state.players) {
    const outcome = outcomes[player.id];
    if (!OUTCOMES.has(outcome)) throw new HttpError(400, 'Choose an answer for every player.');
    clean[player.id] = outcome;
  }
  await store.setCorrections(week, clean);
  return { ok: true };
}

async function saveResponse(body, store, now) {
  const state = await store.getState();
  const playerId = String(body.playerId || '');
  const week = String(body.week || '');
  const status = body.status;
  if (!state.players.some((player) => player.id === playerId)) {
    throw new HttpError(400, 'That player is not on the list.');
  }
  if (status !== 'in' && status !== 'out') throw new HttpError(400, 'Tap in or out.');
  if (!nextThursdays(now, 8).includes(week)) throw new HttpError(400, 'That week is finished.');
  const meta = state.weeks.find((row) => row.week === week);
  if (meta?.cancelled) throw new HttpError(400, 'No tennis this week.');
  if (phase(week, now) === 'closed') throw new HttpError(400, 'This week is finished. Ask Ofir if it needs fixing.');
  await store.upsertResponse(playerId, week, status, now.toISOString());
  return { ok: true };
}

export async function handleApi(request, { store, bootstrapPin = '', now = () => new Date() }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders() });
  const url = new URL(request.url);
  const clock = now();
  try {
    if (url.pathname === '/api/health' && request.method === 'GET') return json({ ok: true });
    if (url.pathname === '/api/state' && request.method === 'GET') {
      const state = await store.getState();
      return json({ ...state, serverTime: clock.toISOString() });
    }
    if (request.method !== 'POST') return json({ error: 'Not found' }, 404);
    const body = await readJson(request);
    if (url.pathname === '/api/responses') return json(await saveResponse(body, store, clock));
    if (url.pathname === '/api/admin/login') return json(await login(body, store, String(bootstrapPin || '').trim(), request, clock));
    if (url.pathname === '/api/admin/logout') {
      const token = await requireAdmin(request, store, clock);
      await store.deleteSession(token);
      return json({ ok: true });
    }
    await requireAdmin(request, store, clock);
    if (url.pathname === '/api/admin/pin') {
      const pin = cleanPin(body.pin);
      const salt = randomHex(16);
      await store.savePin({ salt, hash: await hashPin(pin, salt) });
      return json({ ok: true });
    }
    if (url.pathname === '/api/admin/week') return json(await saveWeek(body, store, clock));
    if (url.pathname === '/api/admin/correction') return json(await saveCorrection(body, store, clock));
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'Something went wrong. Try again.' }, 500);
  }
}
