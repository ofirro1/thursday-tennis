// Cloudflare D1 adapter. Same methods as memory-store.js.

function mapPlayer(row) {
  return { id: row.id, name: row.name, isAdmin: row.is_admin === 1, sortOrder: row.sort_order };
}

export function createD1Store(db) {
  return {
    async getState() {
      const [players, responses, weeks, corrections, guests] = await Promise.all([
        db.prepare('select id, name, is_admin, sort_order from players order by sort_order asc').all(),
        db.prepare('select week, player_id, status from responses').all(),
        db.prepare('select week, cancelled, reason, corrected from weeks').all(),
        db.prepare('select week, player_id, outcome from corrections').all(),
        db.prepare('select id, week, name, created_at from guests order by created_at asc').all(),
      ]);
      return {
        players: players.results.map(mapPlayer),
        responses: responses.results.map((row) => ({ week: row.week, playerId: row.player_id, status: row.status })),
        weeks: weeks.results.map((row) => ({
          week: row.week,
          cancelled: row.cancelled === 1,
          reason: row.reason || '',
          corrected: row.corrected === 1,
        })),
        corrections: corrections.results.map((row) => ({
          week: row.week,
          playerId: row.player_id,
          outcome: row.outcome,
        })),
        guests: guests.results.map((row) => ({
          id: row.id,
          week: row.week,
          name: row.name,
          createdAt: row.created_at,
        })),
      };
    },
    async deleteResponse(playerId, week) {
      await db.prepare('delete from responses where week = ? and player_id = ?').bind(week, playerId).run();
    },
    async addGuest(guest) {
      await db.prepare('insert into guests (id, week, name, created_at) values (?, ?, ?, ?)')
        .bind(guest.id, guest.week, guest.name, guest.createdAt).run();
    },
    async removeGuest(id) {
      await db.prepare('delete from guests where id = ?').bind(id).run();
    },
    async upsertResponse(playerId, week, status, updatedAt) {
      await db.prepare(
        `insert into responses (week, player_id, status, updated_at)
         values (?, ?, ?, ?)
         on conflict(week, player_id) do update set status = excluded.status, updated_at = excluded.updated_at`,
      ).bind(week, playerId, status, updatedAt).run();
    },
    async setCancelled(week, cancelled, reason) {
      await db.prepare(
        `insert into weeks (week, cancelled, reason, corrected) values (?, ?, ?, 0)
         on conflict(week) do update set cancelled = excluded.cancelled, reason = excluded.reason`,
      ).bind(week, cancelled ? 1 : 0, reason).run();
    },
    async setCorrections(week, outcomes) {
      const statements = [
        db.prepare(
          `insert into weeks (week, cancelled, reason, corrected) values (?, 0, '', 1)
           on conflict(week) do update set corrected = 1`,
        ).bind(week),
        db.prepare('delete from corrections where week = ?').bind(week),
        ...Object.entries(outcomes).map(([playerId, outcome]) => db.prepare(
          'insert into corrections (week, player_id, outcome) values (?, ?, ?)',
        ).bind(week, playerId, outcome)),
      ];
      await db.batch(statements);
    },
    async clearCorrections(week) {
      await db.batch([
        db.prepare('update weeks set corrected = 0 where week = ?').bind(week),
        db.prepare('delete from corrections where week = ?').bind(week),
      ]);
    },
    async getPin() {
      const row = await db.prepare('select salt, hash from pin where id = 1').first();
      return row ? { salt: row.salt, hash: row.hash } : null;
    },
    async savePin(pin) {
      await db.prepare(
        `insert into pin (id, salt, hash) values (1, ?, ?)
         on conflict(id) do update set salt = excluded.salt, hash = excluded.hash`,
      ).bind(pin.salt, pin.hash).run();
    },
    async getAttempt(ip) {
      const row = await db.prepare('select failures, locked_until from attempts where ip = ?').bind(ip).first();
      return row ? { failures: row.failures, lockedUntil: row.locked_until } : { failures: 0, lockedUntil: null };
    },
    async saveAttempt(ip, attempt) {
      await db.prepare(
        `insert into attempts (ip, failures, locked_until) values (?, ?, ?)
         on conflict(ip) do update set failures = excluded.failures, locked_until = excluded.locked_until`,
      ).bind(ip, attempt.failures, attempt.lockedUntil).run();
    },
    async saveSession(token, expiresAt) {
      await db.prepare('insert into sessions (token, expires_at) values (?, ?)').bind(token, expiresAt).run();
    },
    async getSession(token) {
      const row = await db.prepare('select token, expires_at from sessions where token = ?').bind(token).first();
      return row ? { token: row.token, expiresAt: row.expires_at } : null;
    },
    async deleteSession(token) {
      await db.prepare('delete from sessions where token = ?').bind(token).run();
    },
    async deleteExpiredSessions(nowIso) {
      await db.prepare('delete from sessions where expires_at <= ?').bind(nowIso).run();
    },
  };
}
