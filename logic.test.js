import assert from 'node:assert/strict';
import test from 'node:test';
import { SEED_PLAYERS } from './seed.js';
import {
  recentGuestNames,
  cutoffText,
  cutoffUtc,
  closeUtc,
  historyText,
  isThursday,
  nextThursdays,
  phase,
  projectState,
  selectPlayers,
  shortMessage,
  tiebreak,
} from './logic.js';

const players = SEED_PLAYERS;

function availability(ids, status = 'in') {
  const out = {};
  for (const id of ids) out[id] = status;
  return out;
}

function allIn(except = {}) {
  const out = availability(players.map((player) => player.id), 'in');
  Object.assign(out, except);
  return out;
}

test('next Thursdays from Saturday 14 November 2026', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  assert.deepEqual(nextThursdays(now, 4), [
    '2026-11-19',
    '2026-11-26',
    '2026-12-03',
    '2026-12-10',
  ]);
});

test('Thursday morning still includes today, 8pm moves on', () => {
  assert.equal(nextThursdays(new Date('2026-11-18T22:00:00.000Z'), 1)[0], '2026-11-19');
  assert.equal(nextThursdays(new Date('2026-11-19T10:00:00.000Z'), 1)[0], '2026-11-26');
});

test('the board crosses into the next year', () => {
  const now = new Date('2026-12-31T01:00:00.000Z');
  assert.deepEqual(nextThursdays(now, 4), [
    '2026-12-31',
    '2027-01-07',
    '2027-01-14',
    '2027-01-21',
  ]);
});

test('cutoff is Wednesday 8pm Brisbane and the game locks Thursday 8pm', () => {
  const week = '2026-11-19';
  assert.equal(cutoffText(week), 'Wednesday 18 November, 8pm');
  assert.equal(new Date(cutoffUtc(week)).toISOString(), '2026-11-18T10:00:00.000Z');
  assert.equal(new Date(closeUtc(week)).toISOString(), '2026-11-19T10:00:00.000Z');
  assert.equal(phase(week, new Date('2026-11-18T09:59:00.000Z')), 'open');
  assert.equal(phase(week, new Date('2026-11-18T10:00:00.000Z')), 'live');
  assert.equal(phase(week, new Date('2026-11-19T09:59:00.000Z')), 'live');
  assert.equal(phase(week, new Date('2026-11-19T10:00:00.000Z')), 'closed');
  assert.equal(isThursday(week), true);
  assert.equal(isThursday('2026-11-18'), false);
  assert.equal(isThursday('2026-02-31'), false);
});

test('exactly four in: they play', () => {
  const result = selectPlayers({
    players,
    weekId: '2026-11-19',
    past: [],
    availability: allIn({ mick: 'out', carlton: 'out' }),
  });
  assert.deepEqual(result.playing, ['chris', 'gordon', 'john', 'ofir']);
  assert.equal(result.sittingOut.length, 0);
  assert.equal(result.short, false);
  assert.equal(result.outcomes.mick, 'unavailable');
  assert.equal(result.outcomes.carlton, 'unavailable');
});

test('fewer than four: short a player, and out is not a sit-out', () => {
  const result = selectPlayers({
    players,
    weekId: '2026-11-19',
    past: [],
    availability: { chris: 'in', gordon: 'in', john: 'in', mick: 'out' },
  });
  assert.deepEqual(result.playing, ['chris', 'gordon', 'john']);
  assert.equal(result.short, true);
  assert.equal(result.sittingOut.length, 0);
  assert.equal(result.outcomes.mick, 'unavailable');
  assert.equal(result.outcomes.carlton, 'unanswered');
  assert.equal(result.outcomes.ofir, 'unanswered');
  assert.equal(shortMessage(3), 'Short a player this week. Only 3 players are in.');
});

test('Gordon sits out: played last 3 weeks', () => {
  const past = [
    { id: '2026-10-22', outcomes: { gordon: 'unavailable', chris: 'sat_out', john: 'played', mick: 'played', carlton: 'played', ofir: 'played' } },
    { id: '2026-10-29', outcomes: { gordon: 'played', chris: 'played', john: 'sat_out', mick: 'played', carlton: 'played', ofir: 'played' } },
    { id: '2026-11-05', outcomes: { gordon: 'played', chris: 'played', john: 'played', mick: 'sat_out', carlton: 'played', ofir: 'played' } },
    { id: '2026-11-12', outcomes: { gordon: 'played', chris: 'played', john: 'played', mick: 'played', carlton: 'sat_out', ofir: 'played' } },
  ];
  const result = selectPlayers({
    players,
    weekId: '2026-11-19',
    past,
    availability: allIn({ ofir: 'out' }),
  });
  assert.deepEqual(result.playing, ['chris', 'john', 'mick', 'carlton']);
  assert.equal(result.sittingOut.length, 1);
  assert.equal(result.sittingOut[0].playerId, 'gordon');
  assert.equal(result.sittingOut[0].reason, 'played the last 3 weeks');
  assert.equal(result.outcomes.gordon, 'sat_out');
  assert.equal(result.outcomes.ofir, 'unavailable');
});

test('being out does not count as sitting out', () => {
  // Gordon has played the most, and his latest week he was out.
  // That must not push him up the list. He sits because he has played more.
  const past = ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'].map((id) => ({
    id,
    outcomes: {
      gordon: 'played',
      chris: 'unavailable',
      john: 'unavailable',
      mick: 'unavailable',
      carlton: 'unavailable',
      ofir: 'unavailable',
    },
  }));
  past.push(
    { id: '2026-10-22', outcomes: { gordon: 'played', chris: 'played', john: 'played', mick: 'played', carlton: 'played', ofir: 'unavailable' } },
    { id: '2026-10-29', outcomes: { gordon: 'played', chris: 'played', john: 'played', mick: 'played', carlton: 'played', ofir: 'unavailable' } },
    { id: '2026-11-12', outcomes: { gordon: 'unavailable', chris: 'played', john: 'played', mick: 'played', carlton: 'played', ofir: 'unavailable' } },
  );
  const result = selectPlayers({
    players,
    weekId: '2026-11-19',
    past,
    availability: allIn({ ofir: 'out' }),
  });
  assert.deepEqual(result.sittingOut.map((row) => row.playerId), ['gordon']);
  assert.match(result.sittingOut[0].reason, /played \d+ games so far/);
});

test('fewest games wins the tie when sit-outs match', () => {
  const past = [];
  for (const id of ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29']) {
    past.push({
      id,
      outcomes: {
        gordon: 'played',
        chris: id === '2026-10-01' || id === '2026-10-08' ? 'played' : 'unavailable',
        john: id === '2026-10-01' || id === '2026-10-08' ? 'played' : 'unavailable',
        mick: id === '2026-10-01' || id === '2026-10-08' ? 'played' : 'unavailable',
        carlton: id === '2026-10-01' || id === '2026-10-08' ? 'played' : 'unavailable',
        ofir: 'unavailable',
      },
    });
  }
  const result = selectPlayers({
    players,
    weekId: '2026-11-19',
    past,
    availability: allIn({ ofir: 'out' }),
  });
  assert.deepEqual(result.sittingOut.map((row) => row.playerId), ['gordon']);
  assert.equal(result.sittingOut[0].reason, 'played 5 games so far');
  assert.ok(result.playing.includes('chris'));
});

test('the coin toss is stable and does not favour a name', () => {
  const input = {
    players,
    weekId: '2026-11-19',
    past: [],
    availability: allIn(),
  };
  const first = selectPlayers(input);
  const second = selectPlayers(input);
  assert.equal(first.playing.length, 4);
  assert.equal(first.sittingOut.length, 2);
  assert.deepEqual(first.playing, second.playing);
  assert.deepEqual(
    first.sittingOut.map((row) => row.playerId),
    second.sittingOut.map((row) => row.playerId),
  );
  assert.match(first.sittingOut[0].reason, /coin toss/);
  assert.equal(tiebreak('2026-11-19', 'chris'), tiebreak('2026-11-19', 'chris'));
  assert.notEqual(tiebreak('2026-11-19', 'chris'), tiebreak('2026-11-19', 'gordon'));
});

test('a picked player dropping out promotes the next person', () => {
  const past = [
    { id: '2026-11-12', outcomes: { gordon: 'sat_out', chris: 'played', john: 'played', mick: 'played', carlton: 'played', ofir: 'unavailable' } },
  ];
  const before = selectPlayers({
    players,
    weekId: '2026-11-19',
    past,
    availability: allIn({ ofir: 'out' }),
  });
  assert.ok(before.playing.includes('gordon'));
  const dropped = before.playing.find((id) => id !== 'gordon');
  const next = before.sittingOut[0]?.playerId;
  const after = selectPlayers({
    players,
    weekId: '2026-11-19',
    past,
    availability: allIn({ ofir: 'out', [dropped]: 'out' }),
  });
  assert.ok(!after.playing.includes(dropped));
  assert.equal(after.outcomes[dropped], 'unavailable');
  if (next) assert.ok(after.playing.includes(next));
  assert.equal(after.short, false);
});

test('a live week shows the sit-out reason and a dropout fills from the same order', () => {
  const corrections = [];
  const weeks = [];
  const add = (week, outcomes) => {
    weeks.push({ week, cancelled: false, reason: '', corrected: true });
    for (const [playerId, outcome] of Object.entries(outcomes)) {
      corrections.push({ week, playerId, outcome });
    }
  };
  add('2026-10-22', { gordon: 'unavailable', chris: 'sat_out', john: 'played', mick: 'played', carlton: 'played', ofir: 'played' });
  add('2026-10-29', { gordon: 'played', chris: 'played', john: 'sat_out', mick: 'played', carlton: 'played', ofir: 'played' });
  add('2026-11-05', { gordon: 'played', chris: 'played', john: 'played', mick: 'sat_out', carlton: 'played', ofir: 'played' });
  add('2026-11-12', { gordon: 'played', chris: 'played', john: 'played', mick: 'played', carlton: 'sat_out', ofir: 'played' });

  const responses = ['chris', 'gordon', 'john', 'mick', 'carlton'].map((playerId) => ({
    week: '2026-11-19', playerId, status: 'in',
  }));
  responses.push({ week: '2026-11-19', playerId: 'ofir', status: 'out' });
  const now = new Date('2026-11-18T10:30:00.000Z');
  const view = projectState({ players, weeks, corrections, responses }, 'gordon', now);
  const card = view.upcoming[0];
  assert.equal(card.id, '2026-11-19');
  assert.equal(card.phase, 'live');
  assert.equal(card.you.text, "You're sitting out: you played the last 3 weeks");
  assert.ok(card.lines.some((line) => line.includes('5 are in. One sits out. Gordon sits out this week: he played the last 3 weeks.')));

  const promoted = projectState({
    players,
    weeks,
    corrections,
    responses: responses.map((row) => (row.playerId === 'gordon' ? { ...row, status: 'out' } : row)),
  }, 'chris', now);
  const nextCard = promoted.upcoming[0];
  assert.equal(nextCard.you.text, "🎾 You're playing!");
  assert.equal(nextCard.banner, null);
  assert.ok(nextCard.lines.some((line) => line.startsWith('Playing:')));
  assert.ok(!nextCard.lines.some((line) => line.includes('sits out')));
});

test('cancelled weeks stay out of the counts', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const view = projectState({
    players,
    weeks: [{ week: '2026-11-12', cancelled: true, reason: 'Rain', corrected: false }],
    corrections: [],
    responses: players.map((player) => ({ week: '2026-11-12', playerId: player.id, status: 'in' })),
  }, 'ofir', now);
  assert.equal(view.history[0].text, 'Thu 12 Nov 2026: no tennis (Rain).');
  for (const row of view.stats) {
    assert.equal(row.played, 0);
    assert.equal(row.satOut, 0);
    assert.equal(row.unavailable, 0);
  }
});

test('history counts games, sit-outs, and times out', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const outcomes = {
    chris: 'played', gordon: 'played', john: 'played', mick: 'played', carlton: 'sat_out', ofir: 'unavailable',
  };
  const view = projectState({
    players,
    weeks: [{ week: '2026-11-12', cancelled: false, reason: '', corrected: true }],
    corrections: Object.entries(outcomes).map(([playerId, outcome]) => ({ week: '2026-11-12', playerId, outcome })),
    responses: [],
  }, null, now);
  const byId = Object.fromEntries(view.stats.map((row) => [row.id, row]));
  assert.equal(byId.chris.played, 1);
  assert.equal(byId.carlton.satOut, 1);
  assert.equal(byId.carlton.played, 0);
  assert.equal(byId.ofir.unavailable, 1);
  assert.equal(byId.ofir.satOut, 0);
  assert.match(view.history[0].text, /Chris, Gordon, John and Mick played/);
  assert.match(view.history[0].text, /Carlton sat out/);
  assert.match(view.history[0].text, /Ofir can't make it/);
});

test('open weeks ask for an answer and do not pick anyone yet', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const view = projectState({
    players,
    weeks: [],
    corrections: [],
    responses: [{ week: '2026-11-19', playerId: 'gordon', status: 'in' }],
  }, 'gordon', now);
  const card = view.upcoming[0];
  assert.equal(card.phase, 'open');
  assert.equal(card.you.text, "👍 You're in");
  assert.equal(card.prompt, '');
  assert.equal(card.banner, null);
  assert.ok(card.lines.includes('In: Gordon'));
  assert.ok(card.lines.includes('Not yet: Chris, John, Mick, Carlton and Ofir'));
  assert.ok(card.lines.includes('Final four confirmed Wednesday night.'));
  assert.equal(view.history.length, 0);
});

test('history text for a short week', () => {
  const text = historyText({
    id: '2026-11-12',
    cancelled: false,
    corrected: false,
    outcomes: {
      chris: 'played', gordon: 'played', john: 'played', mick: 'unanswered', carlton: 'unanswered', ofir: 'unavailable',
    },
    sittingOut: [],
  }, players);
  assert.match(text, /Short a player/);
  assert.match(text, /Ofir can't make it/);
});

test('recent guest names are one-tap chips, skipping people already on this week', () => {
  const names = recentGuestNames([
    { week: '2026-11-12', name: 'Meredith', createdAt: '2026-11-12T01:00:00.000Z' },
    { week: '2026-11-05', name: 'Sam', createdAt: '2026-11-05T01:00:00.000Z' },
    { week: '2026-10-29', name: 'Meredith', createdAt: '2026-10-29T01:00:00.000Z' },
    { week: '2026-11-19', name: 'Sam', createdAt: '2026-11-14T01:00:00.000Z' },
  ], '2026-11-19');
  assert.deepEqual(names, ['Meredith']);
});

test('a guest fills a spot only when fewer than four regulars are in', () => {
  const full = selectPlayers({
    players,
    weekId: '2026-11-19',
    past: [],
    availability: allIn(),
    guests: [{ id: 'g1', name: 'Sam', createdAt: '2026-11-14T00:00:00.000Z' }],
  });
  assert.equal(full.guestPlaying.length, 0);
  assert.equal(full.guestWaiting[0].name, 'Sam');
  assert.equal(full.short, false);

  const short = selectPlayers({
    players,
    weekId: '2026-11-19',
    past: [],
    availability: { chris: 'in', gordon: 'in', john: 'in' },
    guests: [
      { id: 'g1', name: 'Sam', createdAt: '2026-11-14T00:00:00.000Z' },
      { id: 'g2', name: 'Ben', createdAt: '2026-11-14T01:00:00.000Z' },
    ],
  });
  assert.deepEqual(short.guestPlaying.map((guest) => guest.name), ['Sam']);
  assert.deepEqual(short.guestWaiting.map((guest) => guest.name), ['Ben']);
  assert.equal(short.short, false);
  assert.equal(short.outcomes.chris, 'played');
  assert.equal(short.outcomes.mick, 'unanswered');
});

test('guests do not change fairness counts', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const view = projectState({
    players,
    weeks: [{ week: '2026-11-12', cancelled: false, reason: '', corrected: false }],
    corrections: [],
    responses: [
      { week: '2026-11-12', playerId: 'chris', status: 'in' },
      { week: '2026-11-12', playerId: 'gordon', status: 'in' },
      { week: '2026-11-12', playerId: 'john', status: 'in' },
    ],
    guests: [{ id: 'g1', week: '2026-11-12', name: 'Sam', createdAt: '2026-11-12T00:00:00.000Z' }],
  }, 'chris', now);
  const chris = view.stats.find((row) => row.id === 'chris');
  assert.equal(chris.played, 1);
  assert.equal(view.stats.every((row) => row.name !== 'Sam'), true);
  assert.match(view.history[0].text, /Sam \(guest\) played/);
});

test('12 November 2026 records four played and two who could not come', () => {
  const now = new Date('2026-11-14T00:00:00.000Z');
  const outcomes = {
    chris: 'played', gordon: 'unavailable', john: 'unavailable', mick: 'played', carlton: 'played', ofir: 'played',
  };
  const view = projectState({
    players,
    weeks: [{ week: '2026-11-12', cancelled: false, reason: '', corrected: true }],
    corrections: Object.entries(outcomes).map(([playerId, outcome]) => ({ week: '2026-11-12', playerId, outcome })),
    responses: [],
    guests: [],
  }, null, now);
  assert.match(view.history[0].text, /Chris, Mick, Carlton and Ofir played/);
  assert.match(view.history[0].text, /Gordon and John can't make it/);
  assert.equal(view.stats.find((row) => row.id === 'gordon').unavailable, 1);
  assert.equal(view.stats.find((row) => row.id === 'gordon').satOut, 0);
});
