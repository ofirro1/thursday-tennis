import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROOKFIELD,
  eveningReading,
  formatForecastLine,
  mergeForecasts,
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
};

test('Brookfield sits in the western Brisbane suburb', () => {
  assert.ok(BROOKFIELD.latitude < -27.45 && BROOKFIELD.latitude > -27.53);
  assert.ok(BROOKFIELD.longitude > 152.87 && BROOKFIELD.longitude < 152.94);
});

test('formats the 8pm line with a rounded temperature and rain chance', () => {
  const reading = eveningReading(thursday, '2026-11-19');
  assert.equal(reading.hour, 20);
  assert.equal(formatForecastLine(reading), '🌦️ 8pm: 60% chance of rain, 24°');
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
  assert.equal(formatForecastLine(reading), '🌤️ 8pm: 10% chance of rain, 21°');
});

test('drops the rain chance when the model has no percentage', () => {
  assert.equal(formatForecastLine({
    temperature: 18.4,
    precipitationProbability: null,
    weatherCode: 0,
  }), '☀️ 8pm: 18°');
  assert.equal(formatForecastLine(null), null);
  assert.equal(formatForecastLine({ temperature: null, weatherCode: 0 }), null);
});

test('picks an emoji from the weather code', () => {
  assert.equal(weatherEmoji(0), '☀️');
  assert.equal(weatherEmoji(3), '☁️');
  assert.equal(weatherEmoji(45), '🌫️');
  assert.equal(weatherEmoji(61), '🌧️');
  assert.equal(weatherEmoji(95), '⛈️');
  assert.equal(weatherEmoji(71), '❄️');
  assert.equal(weatherEmoji(null), '🌡️');
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
    '2026-11-19': '🌤️ 8pm: 2% chance of rain, 19°',
  });
  assert.equal(merged.sources['2026-11-19'], 'best_match');
  assert.equal(merged.model, 'best_match');
  assert.equal(weatherCredit(merged.model), 'Weather: Open-Meteo, Brookfield');
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
  assert.equal(weatherCredit(merged.model), 'Weather: Open-Meteo / BOM model, Brookfield');
});
