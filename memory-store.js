import { SEED_PLAYERS } from './seed.js';

function fresh() {
  return {
    players: SEED_PLAYERS.map((player) => ({ ...player })),
    responses: [],
    weeks: [],
    corrections: [],
    guests: [],
    pin: null,
    sessions: [],
    attempts: {},
  };
}

export function createStore(saved) {
  const data = saved ? structuredClone(saved) : fresh();
  data.players = data.players?.length ? data.players : fresh().players;
  data.responses ||= [];
  data.weeks ||= [];
  data.corrections ||= [];
  data.guests ||= [];
  data.sessions ||= [];
  data.attempts ||= {};

  return {
    dump() {
      return structuredClone(data);
    },
    async getState() {
      return {
        players: data.players.map((player) => ({ ...player })),
        responses: data.responses.map((row) => ({ week: row.week, playerId: row.playerId, status: row.status })),
        weeks: data.weeks.map((row) => ({ ...row })),
        corrections: data.corrections.map((row) => ({ ...row })),
        guests: data.guests.map((row) => ({ ...row })),
      };
    },
    async deleteResponse(playerId, week) {
      data.responses = data.responses.filter((row) => !(row.week === week && row.playerId === playerId));
    },
    async addGuest(guest) {
      data.guests.push({ ...guest });
    },
    async removeGuest(id) {
      data.guests = data.guests.filter((guest) => guest.id !== id);
    },
    async upsertResponse(playerId, week, status, updatedAt) {
      const found = data.responses.find((row) => row.week === week && row.playerId === playerId);
      if (found) {
        found.status = status;
        found.updatedAt = updatedAt;
      } else {
        data.responses.push({ week, playerId, status, updatedAt });
      }
    },
    async setCancelled(week, cancelled, reason) {
      const found = data.weeks.find((row) => row.week === week);
      if (found) {
        found.cancelled = cancelled;
        found.reason = reason;
      } else {
        data.weeks.push({ week, cancelled, reason, corrected: false });
      }
    },
    async setCorrections(week, outcomes) {
      const found = data.weeks.find((row) => row.week === week);
      if (found) found.corrected = true;
      else data.weeks.push({ week, cancelled: false, reason: '', corrected: true });
      data.corrections = data.corrections.filter((row) => row.week !== week);
      for (const [playerId, outcome] of Object.entries(outcomes)) {
        data.corrections.push({ week, playerId, outcome });
      }
    },
    async clearCorrections(week) {
      const found = data.weeks.find((row) => row.week === week);
      if (found) found.corrected = false;
      data.corrections = data.corrections.filter((row) => row.week !== week);
    },
    async getPin() {
      return data.pin ? { ...data.pin } : null;
    },
    async savePin(pin) {
      data.pin = { salt: pin.salt, hash: pin.hash };
    },
    async getAttempt(ip) {
      return data.attempts[ip] ? { ...data.attempts[ip] } : { failures: 0, lockedUntil: null };
    },
    async saveAttempt(ip, attempt) {
      data.attempts[ip] = { failures: attempt.failures, lockedUntil: attempt.lockedUntil };
    },
    async saveSession(token, expiresAt) {
      data.sessions.push({ token, expiresAt });
    },
    async getSession(token) {
      const found = data.sessions.find((row) => row.token === token);
      return found ? { ...found } : null;
    },
    async deleteSession(token) {
      data.sessions = data.sessions.filter((row) => row.token !== token);
    },
    async deleteExpiredSessions(nowIso) {
      data.sessions = data.sessions.filter((row) => row.expiresAt > nowIso);
    },
  };
}
