import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createStore } from './memory-store.js';
import {
  BROOKFIELD,
  cachedForecast,
  eveningReading,
  formatForecastLine,
  formatUpdatedAt,
  forecastRequestUrl,
  keepForecast,
  loadOpenMeteo,
  mergeForecasts,
  usesSunIcon,
  weatherCredit,
  weatherEmoji,
} from './weather.js';

const thursday = {
  time: [
    '2026-11-19T19:00',
    '2026-11-19T20:00',
    '2026-11-19T21:00',
    '2026-11-26T20:00',
  ],
  temperature_2m: [22.4, 23.6, 22.1, null],
  precipitation_probability: [40, 59.6, 70, null],
  weather_code: [2, 80, 61, null],
  is_day: [0, 0, 0, 0],
};

test('Brookfield sits in the western Brisbane suburb', () => {
  assert.ok(BROOKFIELD.latitude < -27.45 && BROOKFIELD.latitude > -27.53);
  assert.ok(BROOKFIELD.longitude > 152.87 && BROOKFIELD.longitude < 152.94);
});

test('formats the 8pm line with a rounded temperature and rain chance', () => {
  const reading = eveningReading(thursday, '2026-11-19');
  assert.equal(reading.hour, 20);
  assert.equal(reading.isDay, 0);
  assert.equal(formatForecastLine(reading), '🌧️ 8pm: 60% chance of rain, 24°');
  assert.equal(usesSunIcon(formatForecastLine(reading).split(' ')[0]), false);
});

test('a date with no evening temperature is left out', () => {
  assert.equal(eveningReading(thursday, '2026-11-26'), null);
  assert.equal(formatForecastLine(eveningReading(thursday, '2026-11-26')), null);
  assert.equal(eveningReading(thursday, '2026-12-03'), null);
});

test('uses 7pm when 8pm is missing, and still labels the game time', () => {
  const hourly = {
    time: ['2026-11-19T19:00', '2026-11-19T21:00'],
    temperature_2m: [21.2, 20.4],
    precipitation_probability: [10, 15],
    weather_code: [1, 0],
  };
  const reading = eveningReading(hourly, '2026-11-19');
  assert.equal(reading.hour, 19);
  assert.equal(formatForecastLine(reading), '☁️ 8pm: 10% chance of rain, 21°');
});

test('drops the rain chance when the model has no percentage', () => {
  assert.equal(formatForecastLine({
    temperature: 18.4,
    precipitationProbability: null,
    weatherCode: 0,
  }), '🌙 8pm: 18°');
  assert.equal(formatForecastLine(null), null);
  assert.equal(formatForecastLine({ temperature: null, weatherCode: 0 }), null);
});

test('8pm uses night icons, and is_day can still pick a daytime icon', () => {
  assert.equal(weatherEmoji(0, 0), '🌙');
  assert.equal(weatherEmoji(0), '🌙');
  assert.equal(weatherEmoji(1, 0), '☁️');
  assert.equal(weatherEmoji(2, 0), '☁️');
  assert.equal(weatherEmoji(3, 0), '☁️');
  assert.equal(weatherEmoji(45, 0), '🌫️');
  assert.equal(weatherEmoji(51, 0), '🌧️');
  assert.equal(weatherEmoji(61, 0), '🌧️');
  assert.equal(weatherEmoji(80, 0), '🌧️');
  assert.equal(weatherEmoji(95, 0), '⛈️');
  assert.equal(weatherEmoji(71), '❄️');
  assert.equal(weatherEmoji(null), '🌡️');
  assert.equal(weatherEmoji(0, 1), '☀️');
  assert.equal(weatherEmoji(1, 1), '🌤️');
  assert.equal(weatherEmoji(2, 1), '⛅');
  assert.equal(formatForecastLine({
    temperature: 22,
    precipitationProbability: 0,
    weatherCode: 0,
    isDay: 1,
    hour: 20,
  }), '🌙 8pm: 0% chance of rain, 22°');
});

test('falls back to the default forecast when BOM has no hourly values', () => {
  const bom = {
    time: ['2026-11-19T20:00', '2026-11-26T20:00'],
    temperature_2m: [null, null],
    precipitation_probability: [null, null],
    weather_code: [null, null],
  };
  const best = {
    time: ['2026-11-19T20:00'],
    temperature_2m: [19.2],
    precipitation_probability: [2],
    weather_code: [1],
  };
  const merged = mergeForecasts(bom, best, ['2026-11-19', '2026-11-26', '2026-12-03']);
  assert.deepEqual(merged.lines, {
    '2026-11-19': '☁️ 8pm: 2% chance of rain, 19°',
  });
  assert.equal(merged.sources['2026-11-19'], 'best_match');
  assert.equal(merged.model, 'best_match');
  assert.equal(
    weatherCredit(merged.model, '2026-11-15T00:45:00.000Z', new Date('2026-11-15T02:00:00.000Z')),
    'Updated 10:45am · Open-Meteo, Brookfield',
  );
});

test('keeps BOM for a date that has an evening temperature', () => {
  const bom = {
    time: ['2026-11-19T20:00'],
    temperature_2m: [24],
    precipitation_probability: [60],
    weather_code: [61],
  };
  const best = {
    time: ['2026-11-19T20:00', '2026-11-26T20:00'],
    temperature_2m: [10, 22],
    precipitation_probability: [1, 5],
    weather_code: [0, 2],
  };
  const merged = mergeForecasts(bom, best, ['2026-11-19', '2026-11-26']);
  assert.equal(merged.lines['2026-11-19'], '🌧️ 8pm: 60% chance of rain, 24°');
  assert.equal(merged.sources['2026-11-19'], 'bom_access_global');
  assert.equal(merged.sources['2026-11-26'], 'best_match');
  assert.equal(merged.model, 'bom_access_global+best_match');
  assert.equal(
    weatherCredit(merged.model, '2026-11-14T00:45:00.000Z', new Date('2026-11-15T02:00:00.000Z')),
    'Updated Sat 10:45am · Open-Meteo / BOM model, Brookfield',
  );
});

test('updated time is Brisbane, with the weekday once the day has passed', () => {
  const now = new Date('2026-11-15T02:00:00.000Z');
  assert.equal(formatUpdatedAt('2026-11-15T00:45:00.000Z', now), '10:45am');
  assert.equal(formatUpdatedAt('2026-11-15T02:00:00.000Z', now), '12:00pm');
  assert.equal(formatUpdatedAt('2026-11-14T14:00:00.000Z', now), '12:00am');
  assert.equal(formatUpdatedAt('2026-11-14T00:45:00.000Z', now), 'Sat 10:45am');
});

test('a failed forecast keeps the last good lines and drops a finished Thursday', () => {
  const previous = {
    lines: {
      '2026-11-12': '🌙 8pm: 0% chance of rain, 20°',
      '2026-11-19': '☁️ 8pm: 2% chance of rain, 19°',
    },
    model: 'best_match',
    fetchedAt: '2026-11-14T00:45:00.000Z',
  };
  const kept = keepForecast(previous, null, ['2026-11-19', '2026-11-26']);
  assert.deepEqual(kept.lines, { '2026-11-19': '☁️ 8pm: 2% chance of rain, 19°' });
  assert.equal(kept.fetchedAt, '2026-11-14T00:45:00.000Z');
  const newer = keepForecast(kept, {
    lines: { '2026-11-26': '🌧️ 8pm: 40% chance of rain, 22°' },
    model: 'best_match',
    fetchedAt: '2026-11-15T00:45:00.000Z',
  }, ['2026-11-19', '2026-11-26']);
  assert.equal(newer.lines['2026-11-19'], '☁️ 8pm: 2% chance of rain, 19°');
  assert.match(newer.lines['2026-11-26'], /40% chance of rain/);
  assert.equal(newer.fetchedAt, '2026-11-15T00:45:00.000Z');
});

test('Open-Meteo asks the Bureau model first, then the usual forecast', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(String(url));
    const bom = String(url).includes('bom_access_global');
    const hourly = bom
      ? {
        time: ['2026-11-19T20:00'],
        temperature_2m: [null],
        precipitation_probability: [null],
        weather_code: [null],
        is_day: [0],
      }
      : {
        time: ['2026-11-19T20:00'],
        temperature_2m: [19.2],
        precipitation_probability: [2],
        weather_code: [1],
        is_day: [0],
      };
    return { ok: true, json: async () => ({ hourly }) };
  };
  const url = forecastRequestUrl('bom_access_global');
  assert.match(url, /latitude=-27\.4948/);
  assert.match(url, /longitude=152\.9115/);
  assert.match(url, /forecast_days=7/);
  assert.match(url, /timezone=Australia%2FBrisbane/);
  assert.match(url, /is_day/);
  const result = await loadOpenMeteo(['2026-11-19', '2026-11-26'], fetchImpl);
  assert.equal(urls.length, 2);
  assert.match(urls[0], /models=bom_access_global/);
  assert.equal(urls[1].includes('models='), false);
  assert.equal(result.model, 'best_match');
  assert.match(result.lines['2026-11-19'], /☁️ 8pm: 2% chance of rain, 19°/);
  assert.equal(result.lines['2026-11-26'], undefined);
  assert.equal(await loadOpenMeteo(['2026-11-19'], async () => { throw new Error('down'); }), null);
});

test('a fresh cache is shared, and a failed refresh keeps the original time', async () => {
  const store = createStore();
  await store.upsertResponse('chris', '2026-11-19', 'in', '2026-11-14T00:00:00.000Z');
  const now = new Date('2026-11-15T01:00:00.000Z');
  let calls = 0;
  const load = async () => {
    calls += 1;
    return { lines: { '2026-11-19': '☁️ 8pm: 2% chance of rain, 19°' }, model: 'best_match' };
  };
  const first = await cachedForecast({ store, now, dates: ['2026-11-19'], load });
  assert.equal(first.fetchedAt, now.toISOString());
  assert.equal(calls, 1);
  const again = await cachedForecast({
    store,
    now: new Date(now.getTime() + 30 * 60 * 1000),
    dates: ['2026-11-19'],
    load,
  });
  assert.equal(again.fetchedAt, first.fetchedAt);
  assert.equal(calls, 1);
  const stale = await cachedForecast({
    store,
    now: new Date(now.getTime() + 2 * 60 * 60 * 1000),
    dates: ['2026-11-19'],
    load: async () => { throw new Error('down'); },
  });
  assert.equal(stale.fetchedAt, first.fetchedAt);
  assert.equal(stale.lines['2026-11-19'], first.lines['2026-11-19']);
  const state = await store.getState();
  assert.equal(state.responses.length, 1);
  assert.equal(state.responses[0].playerId, 'chris');
});

test('the forecast table is added without deleting saved answers', () => {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists weather_cache/i);
  assert.doesNotMatch(sql, /delete from (players|responses|weeks|corrections|guests)/i);
});
