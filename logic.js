// Who plays when more than four people are free:
// 1. Someone who sat out more recently (while available) plays first.
//    Marking "out" does not count as sitting out.
// 2. If that is a tie, the person with fewer games so far plays first.
// 3. If it is still a tie, a fixed coin toss for that Thursday breaks it,
//    so every phone shows the same four.

export const SPOTS = 4;
const OFFSET_MS = 10 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function brisbaneParts(now) {
  const shifted = new Date(now.getTime() + OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    hh: shifted.getUTCHours(),
    mm: shifted.getUTCMinutes(),
    dow: shifted.getUTCDay(),
  };
}

export function parseYmd(ymd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d, utc: Date.UTC(y, m - 1, d) };
}

export function isThursday(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) return false;
  return new Date(parsed.utc).getUTCDay() === 4;
}

function ymdFromUtc(ms) {
  const dt = new Date(ms);
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${m}-${d}`;
}

// Thursday 00:00 in Brisbane, as a UTC timestamp.
export function thursdayMidnightUtc(ymd) {
  const parsed = parseYmd(ymd);
  if (!parsed) throw new Error('bad date');
  return parsed.utc - OFFSET_MS;
}

// Wednesday 8:00pm Brisbane, when the four are picked.
export function cutoffUtc(ymd) {
  return thursdayMidnightUtc(ymd) - 4 * 60 * 60 * 1000;
}

// Thursday 8:00pm Brisbane, when the game starts and answers lock.
export function closeUtc(ymd) {
  return thursdayMidnightUtc(ymd) + 20 * 60 * 60 * 1000;
}

export function phase(ymd, now) {
  const t = now.getTime();
  if (t >= closeUtc(ymd)) return 'closed';
  if (t >= cutoffUtc(ymd)) return 'live';
  return 'open';
}

// The next Thursday dates still on the board. Today counts until 8pm.
export function nextThursdays(now, count = 4) {
  const b = brisbaneParts(now);
  let daysAhead = (4 - b.dow + 7) % 7;
  if (daysAhead === 0 && b.hh >= 20) daysAhead = 7;
  const start = Date.UTC(b.y, b.m - 1, b.d) + daysAhead * DAY_MS;
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(ymdFromUtc(start + i * 7 * DAY_MS));
  return out;
}

export function recentPastThursdays(now, count = 8) {
  const [upcoming] = nextThursdays(now, 1);
  const start = parseYmd(upcoming).utc - 7 * DAY_MS;
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(ymdFromUtc(start - i * 7 * DAY_MS));
  return out;
}

export function formatMatchDay(ymd, now) {
  const parsed = parseYmd(ymd);
  const weekday = WEEKDAYS[new Date(parsed.utc).getUTCDay()];
  const showYear = now && brisbaneParts(now).y !== parsed.y;
  return `${weekday} ${parsed.d} ${MONTHS[parsed.m - 1]}${showYear ? ` ${parsed.y}` : ''}`;
}

export function formatHistoryDate(ymd) {
  const parsed = parseYmd(ymd);
  return `${parsed.d} ${MONTHS[parsed.m - 1]} ${parsed.y}`;
}

export function cutoffText(ymd) {
  const parsed = parseYmd(ymd);
  const prev = new Date(parsed.utc - DAY_MS);
  return `Wednesday ${prev.getUTCDate()} ${MONTHS[prev.getUTCMonth()]}, 8pm`;
}

export function joinNames(names) {
  if (!names.length) return 'nobody';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Stable for a Thursday so Chris's phone and Gordon's phone agree.
export function tiebreak(weekId, playerId) {
  const text = `${weekId}:${playerId}`;
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function lastSitOut(playerId, past) {
  let last = '';
  for (const week of past) {
    if (week.outcomes[playerId] === 'sat_out' && week.id > last) last = week.id;
  }
  return last;
}

function gamesPlayed(playerId, past) {
  let count = 0;
  for (const week of past) if (week.outcomes[playerId] === 'played') count += 1;
  return count;
}

function playingStreak(playerId, past) {
  const ordered = [...past].sort((a, b) => (a.id < b.id ? -1 : 1));
  let count = 0;
  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (ordered[i].outcomes[playerId] === 'played') count += 1;
    else break;
  }
  return count;
}

function sitReason(sitter, lastIn, past) {
  if (sitter.lastSit !== lastIn.lastSit) {
    const streak = playingStreak(sitter.id, past);
    if (streak === 1) return 'played last week';
    if (streak >= 2) return `played last ${streak} weeks`;
    return 'others sat out more recently';
  }
  if (sitter.games !== lastIn.games) {
    return sitter.games === 1 ? 'played 1 game so far' : `played ${sitter.games} games so far`;
  }
  return 'a coin toss, so the same person does not always sit out';
}

export function shortMessage(count) {
  if (count === 0) return 'Short a player this week. Nobody is in.';
  if (count === 1) return 'Short a player this week. Only 1 player is in.';
  return `Short a player this week. Only ${count} players are in.`;
}

export function selectPlayers({ players, availability, past, weekId }) {
  const orderedPast = [...(past || [])].sort((a, b) => (a.id < b.id ? -1 : 1));
  const available = [];
  for (const player of players) {
    if (availability[player.id] !== 'in') continue;
    available.push({
      id: player.id,
      name: player.name,
      lastSit: lastSitOut(player.id, orderedPast),
      games: gamesPlayed(player.id, orderedPast),
      roll: tiebreak(weekId, player.id),
    });
  }
  available.sort((a, b) => {
    if (a.lastSit !== b.lastSit) return a.lastSit < b.lastSit ? 1 : -1;
    if (a.games !== b.games) return a.games - b.games;
    if (a.roll !== b.roll) return a.roll < b.roll ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  const chosen = available.slice(0, SPOTS);
  const chosenIds = new Set(chosen.map((player) => player.id));
  const lastIn = chosen[chosen.length - 1];
  const sittingOut = available.slice(SPOTS).map((player) => ({
    playerId: player.id,
    name: player.name,
    reason: sitReason(player, lastIn, orderedPast),
  }));

  const outcomes = {};
  for (const player of players) {
    const status = availability[player.id];
    if (status === 'out') outcomes[player.id] = 'unavailable';
    else if (status !== 'in') outcomes[player.id] = 'unanswered';
    else outcomes[player.id] = chosenIds.has(player.id) ? 'played' : 'sat_out';
  }

  const playing = players.filter((player) => outcomes[player.id] === 'played').map((player) => player.id);
  return {
    playing,
    sittingOut,
    short: playing.length < SPOTS,
    outcomes,
  };
}

function namesFor(outcomes, key, players) {
  return players.filter((player) => outcomes[player.id] === key).map((player) => player.name);
}

function settleOne(week, chain, players) {
  if (week.cancelled) {
    return {
      id: week.id,
      cancelled: true,
      cancelReason: (week.cancelReason || '').trim(),
      corrected: false,
      outcomes: {},
      sittingOut: [],
      short: false,
    };
  }
  if (week.corrected) {
    const outcomes = {};
    for (const player of players) outcomes[player.id] = week.corrections[player.id] || 'unanswered';
    const playing = players.filter((player) => outcomes[player.id] === 'played').map((player) => player.id);
    const sittingOut = players
      .filter((player) => outcomes[player.id] === 'sat_out')
      .map((player) => ({ playerId: player.id, name: player.name, reason: '' }));
    return {
      id: week.id,
      cancelled: false,
      corrected: true,
      outcomes,
      sittingOut,
      short: playing.length < SPOTS,
    };
  }
  const result = selectPlayers({
    players,
    availability: week.responses || {},
    past: chain,
    weekId: week.id,
  });
  return {
    id: week.id,
    cancelled: false,
    corrected: false,
    cancelReason: '',
    ...result,
  };
}

function recordedFromState(data) {
  const ids = new Set();
  for (const week of data.weeks || []) ids.add(week.week);
  for (const row of data.responses || []) ids.add(row.week);
  for (const row of data.corrections || []) ids.add(row.week);
  return [...ids].sort().map((id) => {
    const meta = (data.weeks || []).find((week) => week.week === id) || {};
    const responses = {};
    for (const row of data.responses || []) {
      if (row.week === id) responses[row.playerId] = row.status;
    }
    const corrections = {};
    for (const row of data.corrections || []) {
      if (row.week === id) corrections[row.playerId] = row.outcome;
    }
    return {
      id,
      cancelled: !!meta.cancelled,
      cancelReason: meta.reason || '',
      corrected: !!meta.corrected,
      responses,
      corrections,
    };
  });
}

function hasActivity(week) {
  return week.cancelled || week.corrected || Object.keys(week.responses).length > 0;
}

export function historyText(settled, players) {
  const date = formatHistoryDate(settled.id);
  if (settled.cancelled) {
    const why = (settled.cancelReason || '').trim();
    return why ? `${date}: no tennis (${why}).` : `${date}: no tennis.`;
  }
  const played = namesFor(settled.outcomes, 'played', players);
  const sat = namesFor(settled.outcomes, 'sat_out', players);
  const out = namesFor(settled.outcomes, 'unavailable', players);
  const parts = [`${date}: ${joinNames(played)} played.`];
  if (sat.length) parts.push(`${joinNames(sat)} sat out.`);
  if (out.length === 1) parts.push(`${out[0]} was out.`);
  else if (out.length > 1) parts.push(`${joinNames(out)} were out.`);
  if (played.length < SPOTS) parts.push('Short a player.');
  if (settled.corrected) parts.push('Fixed.');
  return parts.join(' ');
}

function statusLine(playerId, phaseName, myStatus, result) {
  if (!playerId) return null;
  if (phaseName === 'open') {
    if (myStatus === 'in') return { tone: 'in', text: 'You are in' };
    if (myStatus === 'out') return { tone: 'out', text: 'You are out' };
    return { tone: 'wait', text: 'Please tap in or out' };
  }
  const outcome = result?.outcomes?.[playerId];
  if (outcome === 'played') return { tone: 'in', text: 'You are playing' };
  if (outcome === 'sat_out') {
    const reason = result.sittingOut.find((row) => row.playerId === playerId)?.reason;
    return { tone: 'sit', text: reason ? `You are sitting out: ${reason}` : 'You are sitting out' };
  }
  if (outcome === 'unavailable') return { tone: 'out', text: 'You are out' };
  return { tone: 'wait', text: 'You did not answer, so you are not playing' };
}

function pickedLines(result, players) {
  const lines = [`Playing: ${joinNames(namesFor(result.outcomes, 'played', players))}`];
  for (const row of result.sittingOut) {
    lines.push(row.reason ? `${row.name} sits out: ${row.reason}` : `${row.name} sits out`);
  }
  const out = namesFor(result.outcomes, 'unavailable', players);
  const yet = namesFor(result.outcomes, 'unanswered', players);
  if (out.length) lines.push(`Out: ${joinNames(out)}`);
  if (yet.length) lines.push(`Not yet: ${joinNames(yet)}`);
  if (result.sittingOut[0]) lines.push(`If someone drops out, ${result.sittingOut[0].name} comes in.`);
  lines.push('You can still change until 8pm Thursday.');
  return lines;
}

function openLines(players, responses) {
  const grouped = { in: [], out: [], yet: [] };
  for (const player of players) {
    const status = responses[player.id];
    if (status === 'in') grouped.in.push(player.name);
    else if (status === 'out') grouped.out.push(player.name);
    else grouped.yet.push(player.name);
  }
  return [
    `In: ${joinNames(grouped.in)}`,
    `Out: ${joinNames(grouped.out)}`,
    `Not yet: ${joinNames(grouped.yet)}`,
  ];
}

function cancelBanner(reason) {
  const text = (reason || '').trim();
  if (!text) return 'No tennis this week.';
  const ended = /[.!]$/.test(text) ? text : `${text}.`;
  return `No tennis this week. ${ended}`;
}

function fullOutcomes(players, outcomes) {
  const out = {};
  for (const player of players) out[player.id] = outcomes?.[player.id] || 'unanswered';
  return out;
}

// Everything the screens need, from the shared answers plus the clock.
export function projectState(data, me, now) {
  const players = [...(data.players || [])].sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));
  const recorded = recordedFromState(data);
  const byId = new Map(recorded.map((week) => [week.id, week]));
  const closed = recorded
    .filter((week) => phase(week.id, now) === 'closed' && hasActivity(week))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  const chain = [];
  const historySettled = [];
  for (const week of closed) {
    const settled = settleOne(week, chain, players);
    historySettled.push(settled);
    if (!settled.cancelled) chain.push(settled);
  }

  const upcoming = nextThursdays(now, 4).map((id) => {
    const week = byId.get(id) || {
      id, cancelled: false, cancelReason: '', corrected: false, responses: {}, corrections: {},
    };
    const title = formatMatchDay(id, now);
    if (week.cancelled) {
      return {
        id,
        title,
        phase: phase(id, now),
        cancelled: true,
        cancelReason: week.cancelReason || '',
        canAnswer: false,
        myStatus: null,
        you: null,
        banner: { tone: 'cancel', text: cancelBanner(week.cancelReason) },
        lines: [],
      };
    }
    const phaseName = phase(id, now);
    const myStatus = week.responses[me] || null;
    if (phaseName === 'open') {
      return {
        id,
        title,
        phase: phaseName,
        cancelled: false,
        cancelReason: '',
        canAnswer: true,
        myStatus,
        you: statusLine(me, 'open', myStatus, null),
        banner: null,
        lines: [...openLines(players, week.responses), `Picked ${cutoffText(id)}.`],
      };
    }
    const result = selectPlayers({
      players,
      availability: week.responses,
      past: chain,
      weekId: id,
    });
    return {
      id,
      title,
      phase: phaseName,
      cancelled: false,
      cancelReason: '',
      canAnswer: phaseName === 'live',
      myStatus,
      you: statusLine(me, phaseName, myStatus, result),
      banner: result.short ? { tone: 'short', text: shortMessage(result.playing.length) } : null,
      lines: pickedLines(result, players),
    };
  });

  const stats = players.map((player) => {
    const row = { id: player.id, name: player.name, played: 0, satOut: 0, unavailable: 0 };
    for (const week of chain) {
      const outcome = week.outcomes[player.id];
      if (outcome === 'played') row.played += 1;
      else if (outcome === 'sat_out') row.satOut += 1;
      else if (outcome === 'unavailable') row.unavailable += 1;
    }
    return row;
  });

  const history = [...historySettled].reverse().map((settled) => ({
    id: settled.id,
    text: historyText(settled, players),
  }));

  const settledById = new Map(historySettled.map((settled) => [settled.id, settled]));
  const adminPast = recentPastThursdays(now, 8).map((id) => {
    const week = byId.get(id);
    const settled = settledById.get(id);
    return {
      id,
      label: formatMatchDay(id, now),
      cancelled: !!week?.cancelled,
      reason: week?.cancelReason || '',
      corrected: !!week?.corrected,
      outcomes: fullOutcomes(players, settled?.outcomes),
    };
  });

  return { upcoming, history, stats, adminPast, players };
}
