import { projectState, recentGuestNames } from './logic.js?v=__VERSION__';
import {
  BROOKFIELD,
  FORECAST_DAYS,
  mergeForecasts,
  weatherCredit,
} from './weather.js?v=__VERSION__';

const state = {
  me: localStorage.getItem('tennis.player') || '',
  token: localStorage.getItem('tennis.admin') || '',
  data: null,
  serverTime: 0,
  fetchedAt: 0,
  error: '',
  loadError: '',
  notice: '',
  pending: '',
  pinInput: '',
  newPin: '',
  showPin: false,
  cancelFor: '',
  cancelReason: '',
  editWeek: '',
  editOutcomes: null,
  returnTo: '',
  guestFor: '',
  guestName: '',
};

const weather = {
  lines: {},
  model: '',
  checkedAt: 0,
  ok: false,
};
let weatherFlight = null;

const app = document.getElementById('app');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}

function configured() {
  return window.TENNIS_CONFIG != null;
}

function base() {
  if (!configured()) return null;
  return String(window.TENNIS_CONFIG.apiUrl || '').replace(/\/$/, '');
}

function clock() {
  if (!state.serverTime) return new Date();
  return new Date(state.serverTime + (Date.now() - state.fetchedAt));
}

function mePlayer() {
  return state.data?.players?.find((player) => player.id === state.me) || null;
}

function iAmAdmin() {
  return !!mePlayer()?.isAdmin;
}

function activeHash() {
  if (location.hash === '#history') return '#history';
  if (location.hash === '#settings' && iAmAdmin()) return '#settings';
  return '#coming';
}

function model() {
  return projectState(state.data, state.me, clock());
}

function disabled() {
  return state.pending ? 'disabled' : '';
}

async function api(path, body) {
  let response;
  try {
    response = await fetch(`${base()}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Check your internet and try again.');
  }
  let payload = {};
  try { payload = await response.json(); } catch { payload = {}; }
  if (response.status === 401 && path !== '/api/admin/login') {
    state.token = '';
    localStorage.removeItem('tennis.admin');
  }
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Try again.');
  return payload;
}

async function load() {
  try {
    const data = await api('/api/state');
    state.data = data;
    state.serverTime = Date.parse(data.serverTime);
    state.fetchedAt = Date.now();
    state.loadError = '';
  } catch {
    state.loadError = state.data
      ? 'Could not refresh. These answers may be old.'
      : 'Cannot load tennis right now. Check your internet and tap Try again.';
  }
  render();
  refreshWeather();
}

const WEATHER_OK_MS = 60 * 60 * 1000;
const WEATHER_FAIL_MS = 15 * 60 * 1000;
const WEATHER_KEY = 'tennis.weather.v2';

function weatherFresh() {
  if (!weather.checkedAt) return false;
  const limit = weather.ok ? WEATHER_OK_MS : WEATHER_FAIL_MS;
  return Date.now() - weather.checkedAt < limit;
}

function rememberWeather() {
  try {
    sessionStorage.setItem(WEATHER_KEY, JSON.stringify({
      at: weather.checkedAt,
      ok: weather.ok,
      model: weather.model,
      lines: weather.lines,
    }));
  } catch { /* this phone may block storage */ }
}

function applyWeatherCache() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(WEATHER_KEY) || 'null');
    if (!saved || typeof saved.at !== 'number' || !saved.lines || typeof saved.lines !== 'object') return;
    const lines = {};
    for (const [key, value] of Object.entries(saved.lines)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof value === 'string' && value.length < 80) lines[key] = value;
    }
    weather.lines = lines;
    weather.model = typeof saved.model === 'string' ? saved.model.slice(0, 80) : '';
    weather.checkedAt = saved.at;
    weather.ok = !!saved.ok;
  } catch { /* ignore a bad cache */ }
}

function forecastUrl(model) {
  const params = new URLSearchParams({
    latitude: String(BROOKFIELD.latitude),
    longitude: String(BROOKFIELD.longitude),
    hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
    timezone: 'Australia/Brisbane',
    forecast_days: String(FORECAST_DAYS),
  });
  if (model) params.set('models', model);
  return `https://api.open-meteo.com/v1/forecast?${params}`;
}

async function fetchHourly(model) {
  const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(8000)
    : undefined;
  const response = await fetch(forecastUrl(model), { signal });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload && payload.hourly ? payload.hourly : null;
}

function upcomingDates() {
  if (!state.data) return [];
  try {
    return model().upcoming.map((card) => card.id);
  } catch {
    return [];
  }
}

function showWeatherUpdate() {
  if (!mePlayer() || state.pending) return;
  if (activeHash() !== '#coming') return;
  render();
}

async function pullWeather() {
  const dates = upcomingDates();
  const [bom, best] = await Promise.all([
    fetchHourly('bom_access_global').catch(() => null),
    fetchHourly('').catch(() => null),
  ]);
  if (!bom && !best) {
    weather.checkedAt = Date.now();
    weather.ok = false;
    return;
  }
  const merged = mergeForecasts(bom, best, dates);
  const same = weather.model === merged.model
    && JSON.stringify(weather.lines) === JSON.stringify(merged.lines);
  weather.lines = merged.lines;
  weather.model = merged.model;
  weather.checkedAt = Date.now();
  weather.ok = true;
  rememberWeather();
  if (!same) showWeatherUpdate();
}

function refreshWeather() {
  if (!configured() || !state.data) return;
  if (weatherFresh()) return;
  if (weatherFlight) return;
  weatherFlight = pullWeather().catch(() => {
    weather.checkedAt = Date.now();
    weather.ok = false;
  }).finally(() => {
    weatherFlight = null;
  });
}

function render() {
  app.innerHTML = page();
  const guestInput = document.getElementById('guest-name');
  if (guestInput) guestInput.focus();
}

function page() {
  if (!configured()) return setupHtml();
  if (!state.data) return bootHtml();
  if (!mePlayer()) return whoHtml();
  const view = model();
  if (activeHash() === '#history') return historyHtml(view);
  if (activeHash() === '#settings') return settingsHtml(view);
  return mainHtml(view);
}

function setupHtml() {
  return `<main class="wrap">
    <h1>Not ready yet</h1>
    <p class="lead">Ask Ofir to finish setup, then open this link again.</p>
    <h2>Ofir</h2>
    <ol>
      <li>On GitHub, set Pages to deploy with GitHub Actions.</li>
      <li>Create a free Cloudflare account and an API token.</li>
      <li>Add the three secrets, then run Deploy.</li>
    </ol>
    <p>The steps are written out in the README file.</p>
  </main>`;
}

function bootHtml() {
  if (!state.loadError) {
    return '<main class="wrap"><h1>Thursday tennis</h1><p class="lead">Loading…</p></main>';
  }
  return `<main class="wrap">
    <h1>Thursday tennis</h1>
    <p class="error" role="alert">${esc(state.loadError)}</p>
    <button type="button" class="btn name" data-action="refresh">Try again</button>
  </main>`;
}

function whoHtml() {
  const buttons = state.data.players.map((player) => `
    <button type="button" class="btn name" data-action="choose" data-id="${esc(player.id)}" ${disabled()}>${esc(player.name)}</button>
  `).join('');
  const back = state.returnTo
    ? `<button type="button" class="btn secondary" data-action="back" ${disabled()}>Back</button>`
    : '';
  return `<main class="wrap">
    ${back}
    <h1>Who are you?</h1>
    <p class="lead">Tap your name. This phone will remember.</p>
    ${alerts()}
    <div class="stack">${buttons}</div>
  </main>`;
}

function alerts() {
  return [
    state.pending ? `<p class="status" role="status">${esc(state.pending)}</p>` : '',
    state.notice ? `<p class="status" role="status">${esc(state.notice)}</p>` : '',
    state.error ? `<p class="error" role="alert">${esc(state.error)}</p>` : '',
    state.loadError ? `<p class="error" role="alert">${esc(state.loadError)}</p>` : '',
  ].join('');
}

function header({ refresh = true } = {}) {
  const name = mePlayer()?.name || '';
  const refreshButton = refresh
    ? `<button type="button" class="btn secondary" data-action="refresh" ${disabled()}>Refresh</button>`
    : '';
  return `<header class="top">
    <h1>🎾 Thursday tennis</h1>
    <p class="sub">8pm at Chris's house</p>
    ${alerts()}
    <p class="who">You are <strong>${esc(name)}</strong></p>
    <button type="button" class="btn ghost" data-action="change" ${disabled()}>Not you? Change</button>
    ${refreshButton}
  </header>`;
}

function tabs() {
  const current = activeHash();
  const items = [['#coming', 'Coming up'], ['#history', 'Past games']];
  if (iAmAdmin()) items.push(['#settings', 'Settings']);
  const buttons = items.map(([hash, label]) => `
    <button type="button" class="tab ${current === hash ? 'on' : ''}" data-action="nav" data-hash="${hash}" ${disabled()}>${label}</button>
  `).join('');
  return `<nav class="tabs">${buttons}</nav>`;
}

function mainHtml(view) {
  const cards = view.upcoming.map((card, index) => {
    const you = card.you ? `<div class="banner ${card.you.tone}${index === 0 ? ' big' : ''}">${esc(card.you.text)}</div>` : '';
    const prompt = card.prompt ? `<p class="prompt">${esc(card.prompt)}</p>` : '';
    const banner = card.banner ? `<div class="banner ${card.banner.tone}">${esc(card.banner.text)}</div>` : '';
    const lines = card.lines.map((line) => `<p>${esc(line)}</p>`).join('');
    const controls = card.canAnswer ? `<div class="stack">
      <button type="button" class="btn choice in ${card.myStatus === 'in' ? 'on' : ''}" data-action="mark" data-week="${esc(card.id)}" data-status="in" aria-pressed="${card.myStatus === 'in'}" ${disabled()}>${card.myStatus === 'in' ? "✅ I'm in" : "👍 I'm in"}</button>
      <button type="button" class="btn choice out ${card.myStatus === 'out' ? 'on' : ''}" data-action="mark" data-week="${esc(card.id)}" data-status="out" aria-pressed="${card.myStatus === 'out'}" ${disabled()}>${card.myStatus === 'out' ? "✅ Can't make it" : "❌ Can't make it"}</button>
    </div>` : '';
    const guestList = (card.guests || []).map((guest) => `
      <p class="guest-line">${guest.playing ? '✅ ' : ''}${esc(guest.name)} (guest)${guest.playing ? '' : ' — not needed'}</p>
      <button type="button" class="btn secondary" data-action="remove-guest" data-id="${esc(guest.id)}" ${disabled()}>Remove ${esc(guest.name)}</button>
    `).join('');
    let guestForm = '';
    if (card.canAnswer) {
      if (state.guestFor === card.id) {
        const chips = recentGuestNames(state.data.guests || [], card.id).map((name) => `
          <button type="button" class="chip" data-action="chip-guest" data-week="${esc(card.id)}" data-name="${esc(name)}" ${disabled()}>${esc(name)}</button>
        `).join('');
        guestForm = `<div class="guest-box">
          <p class="prompt">Someone else for this Thursday.</p>
          ${chips ? `<div class="chips">${chips}</div>` : ''}
          <label>First name
            <input id="guest-name" maxlength="20" autocomplete="off" autocapitalize="words" enterkeyhint="done" value="${esc(state.guestName)}">
          </label>
          <button type="button" class="btn" data-action="save-guest" data-week="${esc(card.id)}" ${disabled()}>Save</button>
          <button type="button" class="btn secondary" data-action="abort-guest" ${disabled()}>Cancel</button>
        </div>`;
      } else {
        guestForm = `<button type="button" class="btn secondary" data-action="ask-guest" data-week="${esc(card.id)}" ${disabled()}>➕ Add someone else</button>`;
      }
    }
    const meter = card.meter ? `<div class="meter ${card.meter.gameOn ? 'on' : 'short'}">
      <div class="dots" aria-label="${esc(card.meter.text)}">${(card.meter.balls || [null, null, null, null]).map((ball) => ball
        ? `<span class="dot filled${ball.guest ? ' guest' : ''}" title="${esc(ball.name)}" aria-label="${esc(ball.name)}">${esc(ball.initials)}</span>`
        : '<span class="dot" aria-hidden="true"></span>').join('')}</div>
      <p class="meter-text">${esc(card.meter.text)}</p>
    </div>` : '';
    const gameOn = card.meter?.gameOn ? '<div class="banner in big">🎾 Game on!</div>' : '';
    const note = weather.lines[card.id] ? weatherCredit(weather.model) : '';
    const forecast = weather.lines[card.id]
      ? `<div class="weather-block">
          <p class="weather">${esc(weather.lines[card.id])}</p>
          ${note ? `<p class="weather-note" data-weather-model="${esc(weather.model)}">${esc(note)}</p>` : ''}
        </div>`
      : '';
    return `<section class="card${index === 0 ? ' next' : ''}${card.meter?.gameOn ? ' game-on' : ''}">
      <h2>${esc(card.title)}</h2>
      ${forecast}${gameOn}${meter}${you}${prompt}${banner}${controls}${lines}${guestList}${guestForm}
    </section>`;
  }).join('');
  return `<main class="wrap with-tabs">${header({ refresh: false })}${cards}</main>${tabs()}`;
}

function historyHtml(view) {
  const rows = view.stats.map((row) => `
    <tr>
      <th scope="row">${esc(row.name)}</th>
      <td>${row.played}</td>
      <td>${row.satOut}</td>
      <td>${row.unavailable}</td>
    </tr>`).join('');
  const past = view.history.length
    ? view.history.map((row) => `<li>${esc(row.text)}</li>`).join('')
    : '<li>No past weeks yet. They show up here after you play.</li>';
  return `<main class="wrap with-tabs">
    ${header()}
    <h2>How many times</h2>
    <p>All weeks so far.</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Played</th>
            <th scope="col">Sat out</th>
            <th scope="col">Can't make it</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <h2>How we pick</h2>
    <ul class="explain">
      <li>If more than four can play, one or two sit out.</li>
      <li>Whoever sat out most recently gets a game.</li>
      <li>If that is even, whoever has played fewer games gets a game.</li>
      <li>A coin toss breaks a tie.</li>
      <li>Can't make it means they said no. Sat out means they could play, but were not picked.</li>
      <li>A guest plays only if fewer than four regulars are in.</li>
    </ul>
    <h2>Past weeks</h2>
    <ul class="past">${past}</ul>
  </main>${tabs()}`;
}

function settingsHtml(view) {
  if (!iAmAdmin()) return mainHtml(view);
  if (!state.token) return `<main class="wrap with-tabs">${header()}${pinHtml()}</main>${tabs()}`;
  if (state.editWeek) return `<main class="wrap with-tabs">${header()}${fixHtml(view)}</main>${tabs()}`;
  return `<main class="wrap with-tabs">${header()}${settingsBody(view)}</main>${tabs()}`;
}

function pinHtml() {
  const type = state.showPin ? 'text' : 'password';
  return `<h2>Settings</h2>
    <p class="lead">For Ofir. Enter the PIN. It is 6 to 8 numbers.</p>
    <label>PIN
      <input id="pin" class="pin" inputmode="numeric" maxlength="8" autocomplete="off" spellcheck="false" type="${type}" value="${esc(state.pinInput)}">
    </label>
    <button type="button" class="btn" data-action="login" ${disabled()}>Continue</button>
    <button type="button" class="btn secondary" data-action="toggle-pin" ${disabled()}>${state.showPin ? 'Hide PIN' : 'Show PIN'}</button>`;
}

function settingsBody(view) {
  const coming = view.upcoming.map((card) => {
    let controls;
    if (card.cancelled) {
      controls = `<p>No tennis${card.cancelReason ? `: ${esc(card.cancelReason)}` : ''}.</p>
        <button type="button" class="btn" data-action="restore" data-week="${esc(card.id)}" ${disabled()}>Play this week after all</button>`;
    } else if (state.cancelFor === card.id) {
      controls = `<label>Why? For example, rain.
          <input id="cancel-reason" maxlength="60" autocomplete="off" value="${esc(state.cancelReason)}">
        </label>
        <button type="button" class="btn" data-action="confirm-cancel" data-week="${esc(card.id)}" ${disabled()}>Yes, cancel this week</button>
        <button type="button" class="btn secondary" data-action="abort-cancel" ${disabled()}>Go back</button>`;
    } else {
      controls = `<p>Tennis is on.</p>
        <button type="button" class="btn secondary" data-action="ask-cancel" data-week="${esc(card.id)}" ${disabled()}>Cancel this week</button>`;
    }
    return `<section class="card"><h2>${esc(card.title)}</h2>${controls}</section>`;
  }).join('');
  const past = view.adminPast.map((week) => `
    <button type="button" class="btn secondary" data-action="open-fix" data-week="${esc(week.id)}" ${disabled()}>${esc(week.label)}${week.cancelled ? ' — no tennis' : ''}</button>
  `).join('');
  return `<h2>Settings</h2>
    <button type="button" class="btn secondary" data-action="lock" ${disabled()}>Lock settings</button>
    <h2>Cancel a week</h2>
    ${coming}
    <h2>Fix a past week</h2>
    <p>Use this if the record is wrong.</p>
    ${past}
    <h2>Change PIN</h2>
    <label>New PIN
      <input id="new-pin" class="pin" inputmode="numeric" maxlength="8" autocomplete="off" spellcheck="false" type="password" value="${esc(state.newPin)}">
    </label>
    <button type="button" class="btn" data-action="save-pin" ${disabled()}>Save new PIN</button>`;
}

function fixHtml(view) {
  const week = view.adminPast.find((item) => item.id === state.editWeek);
  if (!week) return '<p>That week is not here.</p>';
  if (!state.editOutcomes) state.editOutcomes = { ...week.outcomes };
  const back = `<button type="button" class="btn secondary" data-action="close-fix" ${disabled()}>Back</button>`;
  if (week.cancelled) {
    return `<h2>${esc(week.label)}</h2>
      <div class="banner cancel">No tennis this week${week.reason ? `. ${esc(week.reason)}` : ''}.</div>
      <p>Turn tennis back on before you fix who played.</p>
      <button type="button" class="btn" data-action="restore" data-week="${esc(week.id)}" ${disabled()}>Play this week after all</button>
      ${back}`;
  }
  const options = [
    ['played', 'Played'],
    ['sat_out', 'Sat out'],
    ['unavailable', "Can't make it"],
    ['unanswered', 'No answer'],
  ];
  const people = state.data.players.map((player) => {
    const buttons = options.map(([value, label]) => {
      const on = state.editOutcomes[player.id] === value;
      return `<button type="button" class="btn choice pick ${on ? 'on' : ''}" data-action="set-outcome" data-player="${esc(player.id)}" data-outcome="${value}" aria-pressed="${on}" ${disabled()}>${on ? '✓ ' : ''}${label}</button>`;
    }).join('');
    return `<h2>${esc(player.name)}</h2><div class="choices">${buttons}</div>`;
  }).join('');
  return `<h2>Fix ${esc(week.label)}</h2>
    <p>Tap one answer for each player, then save.</p>
    ${people}
    <button type="button" class="btn" data-action="save-fix" ${disabled()}>Save this week</button>
    ${week.corrected ? `<button type="button" class="btn secondary" data-action="clear-fix" ${disabled()}>Use the automatic result again</button>` : ''}
    ${back}`;
}

function choose(id) {
  if (state.returnTo && state.returnTo !== id) {
    state.token = '';
    localStorage.removeItem('tennis.admin');
  }
  state.me = id;
  state.returnTo = '';
  localStorage.setItem('tennis.player', id);
  state.notice = '';
  state.error = '';
  if (location.hash && location.hash !== '#coming') location.hash = '#coming';
  else render();
}

function changePerson() {
  state.returnTo = state.me;
  state.me = '';
  state.editWeek = '';
  state.notice = '';
  render();
}

function backToPlayer() {
  if (!state.returnTo) return;
  state.me = state.returnTo;
  state.returnTo = '';
  render();
}

async function mark(week, status) {
  const snapshot = structuredClone(state.data);
  state.error = '';
  state.notice = '';
  state.pending = 'Saving…';
  const responses = state.data.responses.filter((row) => !(row.week === week && row.playerId === state.me));
  responses.push({ week, playerId: state.me, status });
  state.data = { ...state.data, responses };
  render();
  try {
    await api('/api/responses', { playerId: state.me, week, status });
    state.pending = '';
    await load();
  } catch (error) {
    state.data = snapshot;
    state.pending = '';
    state.error = error.message || 'That did not save. Check your internet and try again.';
    render();
  }
}

async function withPending(label, task) {
  state.pending = label;
  state.error = '';
  state.notice = '';
  render();
  try {
    await task();
  } catch (error) {
    state.error = error.message || 'That did not save. Check your internet and try again.';
  } finally {
    state.pending = '';
    render();
  }
}

async function onClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  const action = target.dataset.action;
  if (action === 'choose') choose(target.dataset.id);
  else if (action === 'change') changePerson();
  else if (action === 'back') backToPlayer();
  else if (action === 'refresh') load();
  else if (action === 'nav') {
    if (location.hash !== target.dataset.hash) location.hash = target.dataset.hash;
    else {
      window.scrollTo(0, 0);
      render();
    }
  } else if (action === 'mark') mark(target.dataset.week, target.dataset.status);
  else if (action === 'toggle-pin') {
    state.showPin = !state.showPin;
    render();
  } else if (action === 'login') {
    await withPending('Checking…', async () => {
      const result = await api('/api/admin/login', { pin: state.pinInput });
      state.token = result.token;
      localStorage.setItem('tennis.admin', result.token);
      state.pinInput = '';
      state.showPin = false;
      state.notice = 'Settings are open.';
    });
  } else if (action === 'lock') {
    await withPending('Locking…', async () => {
      try { await api('/api/admin/logout', {}); } catch { /* still lock this phone */ }
      state.token = '';
      localStorage.removeItem('tennis.admin');
      state.notice = 'Settings are locked.';
    });
  } else if (action === 'ask-guest') {
    state.guestFor = target.dataset.week;
    state.guestName = '';
    render();
  } else if (action === 'abort-guest') {
    state.guestFor = '';
    state.guestName = '';
    render();
  } else if (action === 'chip-guest') {
    const week = target.dataset.week;
    const name = target.dataset.name;
    await withPending('Saving…', async () => {
      await api('/api/guests', { week, name });
      state.guestFor = '';
      state.guestName = '';
      state.notice = `${name} added.`;
      await load();
    });
  } else if (action === 'save-guest') {
    const week = target.dataset.week;
    await withPending('Saving…', async () => {
      await api('/api/guests', { week, name: state.guestName });
      state.guestFor = '';
      state.guestName = '';
      state.notice = 'Saved.';
      await load();
    });
  } else if (action === 'remove-guest') {
    await withPending('Saving…', async () => {
      await api('/api/guests/remove', { id: target.dataset.id });
      state.notice = 'Guest removed.';
      await load();
    });
  } else if (action === 'ask-cancel') {
    state.cancelFor = target.dataset.week;
    state.cancelReason = '';
    render();
  } else if (action === 'abort-cancel') {
    state.cancelFor = '';
    render();
  } else if (action === 'confirm-cancel') {
    const week = target.dataset.week;
    await withPending('Saving…', async () => {
      await api('/api/admin/week', { week, cancelled: true, reason: state.cancelReason });
      state.cancelFor = '';
      state.notice = 'Saved.';
      await load();
    });
  } else if (action === 'restore') {
    const week = target.dataset.week;
    await withPending('Saving…', async () => {
      await api('/api/admin/week', { week, cancelled: false, reason: '' });
      state.notice = 'Saved.';
      await load();
      if (state.editWeek) {
        const updated = model().adminPast.find((item) => item.id === state.editWeek);
        if (updated) state.editOutcomes = { ...updated.outcomes };
      }
    });
  } else if (action === 'open-fix') {
    const view = model();
    const week = view.adminPast.find((item) => item.id === target.dataset.week);
    state.editWeek = target.dataset.week;
    state.editOutcomes = week ? { ...week.outcomes } : {};
    state.notice = '';
    window.scrollTo(0, 0);
    render();
  } else if (action === 'close-fix') {
    state.editWeek = '';
    state.editOutcomes = null;
    render();
  } else if (action === 'set-outcome') {
    state.editOutcomes = { ...state.editOutcomes, [target.dataset.player]: target.dataset.outcome };
    render();
  } else if (action === 'save-fix') {
    await withPending('Saving…', async () => {
      await api('/api/admin/correction', { week: state.editWeek, outcomes: state.editOutcomes });
      state.notice = 'Saved.';
      await load();
    });
  } else if (action === 'clear-fix') {
    await withPending('Saving…', async () => {
      await api('/api/admin/correction', { week: state.editWeek, clear: true });
      state.notice = 'Saved.';
      await load();
      const week = model().adminPast.find((item) => item.id === state.editWeek);
      if (week) state.editOutcomes = { ...week.outcomes };
    });
  } else if (action === 'save-pin') {
    await withPending('Saving…', async () => {
      await api('/api/admin/pin', { pin: state.newPin });
      state.newPin = '';
      state.notice = 'New PIN saved.';
    });
  }
}

function onInput(event) {
  const target = event.target;
  if (target.id === 'pin') state.pinInput = target.value;
  else if (target.id === 'new-pin') state.newPin = target.value;
  else if (target.id === 'cancel-reason') state.cancelReason = target.value;
  else if (target.id === 'guest-name') state.guestName = target.value;
}

function onKey(event) {
  if (event.key !== 'Enter') return;
  if (event.target.id === 'pin') {
    event.preventDefault();
    const button = document.querySelector('[data-action="login"]');
    if (button && !button.disabled) onClick({ target: button });
  }
  if (event.target.id === 'guest-name') {
    event.preventDefault();
    const button = document.querySelector('[data-action="save-guest"]');
    if (button && !button.disabled) onClick({ target: button });
  }
}

document.addEventListener('click', (event) => {
  onClick(event).catch((error) => {
    state.pending = '';
    state.error = error.message || 'Something went wrong. Try again.';
    render();
  });
});
document.addEventListener('input', onInput);
document.addEventListener('keydown', onKey);
window.addEventListener('hashchange', () => {
  state.notice = '';
  state.error = '';
  state.editWeek = '';
  state.editOutcomes = null;
  state.cancelFor = '';
  window.scrollTo(0, 0);
  if (configured() && state.data && activeHash() !== '#settings') load();
  else render();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && configured() && state.data && activeHash() !== '#settings') load();
});
setInterval(() => {
  if (!configured() || !state.data || state.pending) return;
  if (activeHash() === '#settings') return;
  load();
}, 20000);

applyWeatherCache();
render();
if (configured()) load();
