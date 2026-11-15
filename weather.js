import { brisbaneParts } from './logic.js';

// 8pm forecast for the game at Chris's house in Brookfield, Queensland.
// Nominatim places the suburb at -27.4948, 152.9115 (postcode 4069).
export const BROOKFIELD = {
  latitude: -27.4948,
  longitude: 152.9115,
  name: 'Brookfield',
};

export const FORECAST_DAYS = 7;
export const WEATHER_CACHE_MS = 60 * 60 * 1000;

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENING_HOURS = [20, 19, 21];

const SUN_EMOJI = ['☀️', '🌤️', '⛅', '🌦️'];

export function weatherEmoji(code, isDay) {
  if (code == null || code === '') return '🌡️';
  const n = Number(code);
  if (!Number.isFinite(n)) return '🌡️';
  // Missing is_day, or 0, means night. 8pm in Brookfield is after dark.
  const day = isDay === 1 || isDay === true;
  if (n === 0) return day ? '☀️' : '🌙';
  if (n === 1 || n === 2) return day ? (n === 1 ? '🌤️' : '⛅') : '☁️';
  if (n === 3) return '☁️';
  if (n === 45 || n === 48) return '🌫️';
  if (n === 51 || n === 53 || n === 55 || n === 80 || n === 81 || n === 82) return day ? '🌦️' : '🌧️';
  if (n === 56 || n === 57 || (n >= 61 && n <= 67)) return '🌧️';
  if (n >= 71 && n <= 77) return '❄️';
  if (n === 85 || n === 86) return '🌨️';
  if (n === 95 || n === 96 || n === 99) return '⛈️';
  return '🌡️';
}

export function usesSunIcon(emoji) {
  return SUN_EMOJI.includes(emoji);
}

// One short line, e.g. "🌧️ 8pm: 60% chance of rain, 24°".
// Returns null when there is no temperature to show.
export function formatForecastLine(reading) {
  if (!reading || reading.temperature == null || reading.temperature === '') return null;
  if (!Number.isFinite(Number(reading.temperature))) return null;
  const temp = Math.round(Number(reading.temperature));
  const hour = Number(reading.hour);
  const evening = !Number.isFinite(hour) || hour >= 18 || hour < 6;
  // Trust is_day for a daytime hour. The 8pm line never uses a sun.
  const isDay = evening ? 0 : reading.isDay;
  const emoji = weatherEmoji(reading.weatherCode, isDay);
  const pop = reading.precipitationProbability;
  if (pop == null || pop === '' || !Number.isFinite(Number(pop))) {
    return `${emoji} 8pm: ${temp}°`;
  }
  return `${emoji} 8pm: ${Math.round(Number(pop))}% chance of rain, ${temp}°`;
}

function series(hourly, name) {
  const value = hourly?.[name];
  return Array.isArray(value) ? value : [];
}

// The 8pm hour in Australia/Brisbane. If that hour is missing, use 7pm, then 9pm.
export function eveningReading(hourly, ymd) {
  if (!hourly || !Array.isArray(hourly.time) || !/^\d{4}-\d{2}-\d{2}$/.test(ymd || '')) return null;
  const times = hourly.time;
  const temps = series(hourly, 'temperature_2m');
  const pops = series(hourly, 'precipitation_probability');
  const codes = series(hourly, 'weather_code').length ? series(hourly, 'weather_code') : series(hourly, 'weathercode');
  const daylight = series(hourly, 'is_day');
  for (const hour of EVENING_HOURS) {
    const stamp = `${ymd}T${String(hour).padStart(2, '0')}:00`;
    const index = times.indexOf(stamp);
    if (index < 0) continue;
    const temperature = temps[index];
    if (temperature == null || temperature === '' || !Number.isFinite(Number(temperature))) continue;
    const pop = pops[index];
    const code = codes[index];
    const isDay = daylight[index];
    return {
      temperature: Number(temperature),
      precipitationProbability: pop == null || pop === '' ? null : Number(pop),
      weatherCode: code == null || code === '' ? null : Number(code),
      isDay: isDay == null || isDay === '' ? null : Number(isDay),
      hour,
    };
  }
  return null;
}

// Prefer BOM ACCESS-G for a date when that model has an evening temperature.
// Otherwise use the default Open-Meteo forecast. Dates with neither are omitted.
export function mergeForecasts(bomHourly, bestHourly, dates) {
  const lines = {};
  const sources = {};
  for (const date of dates || []) {
    const bomLine = formatForecastLine(eveningReading(bomHourly, date));
    if (bomLine) {
      lines[date] = bomLine;
      sources[date] = 'bom_access_global';
      continue;
    }
    const bestLine = formatForecastLine(eveningReading(bestHourly, date));
    if (bestLine) {
      lines[date] = bestLine;
      sources[date] = 'best_match';
    }
  }
  const used = new Set(Object.values(sources));
  let model = '';
  if (used.has('bom_access_global') && used.has('best_match')) model = 'bom_access_global+best_match';
  else if (used.has('bom_access_global')) model = 'bom_access_global';
  else if (used.has('best_match')) model = 'best_match';
  return { lines, sources, model };
}

export function forecastRequestUrl(model) {
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

async function readHourly(fetchImpl, model) {
  try {
    const signal = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(8000)
      : undefined;
    const response = await fetchImpl(forecastRequestUrl(model), { signal });
    if (!response || !response.ok) return null;
    const payload = await response.json();
    return payload && payload.hourly ? payload.hourly : null;
  } catch {
    return null;
  }
}

// BOM first. For any Thursday it does not cover, use Open-Meteo's usual forecast.
// Returns null when both requests fail, so the caller can keep the last good cache.
export async function loadOpenMeteo(dates, fetchImpl = globalThis.fetch) {
  const wanted = Array.isArray(dates) ? dates : [];
  const bom = await readHourly(fetchImpl, 'bom_access_global');
  const covered = mergeForecasts(bom, null, wanted);
  const missing = wanted.filter((date) => !covered.lines[date]);
  const best = missing.length || !bom ? await readHourly(fetchImpl, '') : null;
  if (!bom && !best) return null;
  const merged = mergeForecasts(bom, best, wanted);
  if (!merged.model) return null;
  return { lines: merged.lines, model: merged.model };
}

export async function cachedForecast({ store, now, dates, load }) {
  const cached = await store.getWeatherCache();
  const cachedAt = Date.parse(cached?.fetchedAt || '');
  const fresh = cached && Number.isFinite(cachedAt) && now.getTime() - cachedAt < WEATHER_CACHE_MS;
  if (fresh) return cached;
  let next = null;
  try {
    next = await load(dates);
  } catch {
    next = null;
  }
  if (next && next.lines && next.model) {
    const saved = {
      lines: next.lines,
      model: next.model,
      fetchedAt: now.toISOString(),
    };
    await store.saveWeatherCache(saved);
    return saved;
  }
  if (cached) return cached;
  return { lines: {}, model: '', fetchedAt: null };
}

// Keep a phone's last good lines. A failed fetch does not blank them.
// A date is removed only after it is no longer on the coming-up list.
export function keepForecast(previous, incoming, upcoming) {
  const allowed = new Set(upcoming || []);
  const prior = previous && typeof previous === 'object' ? previous : {};
  const lines = {};
  for (const [date, line] of Object.entries(prior.lines || {})) {
    if (allowed.has(date) && typeof line === 'string' && line.length > 0 && line.length < 80) lines[date] = line;
  }
  const fresh = incoming
    && typeof incoming.fetchedAt === 'string'
    && incoming.fetchedAt
    && incoming.lines
    && typeof incoming.lines === 'object';
  if (!fresh) {
    return {
      lines,
      model: typeof prior.model === 'string' ? prior.model : '',
      fetchedAt: typeof prior.fetchedAt === 'string' ? prior.fetchedAt : '',
    };
  }
  for (const [date, line] of Object.entries(incoming.lines)) {
    if (allowed.has(date) && typeof line === 'string' && line.length > 0 && line.length < 80) lines[date] = line;
  }
  return {
    lines,
    model: typeof incoming.model === 'string' && incoming.model ? incoming.model : (prior.model || ''),
    fetchedAt: incoming.fetchedAt,
  };
}

export function formatUpdatedAt(fetchedAt, now) {
  const when = new Date(fetchedAt);
  if (!fetchedAt || Number.isNaN(when.getTime())) return '';
  const clockNow = now instanceof Date ? now : new Date(now);
  const fetched = brisbaneParts(when);
  const today = brisbaneParts(clockNow);
  const hour = fetched.hh % 12 || 12;
  const minute = String(fetched.mm).padStart(2, '0');
  const suffix = fetched.hh < 12 ? 'am' : 'pm';
  const clock = `${hour}:${minute}${suffix}`;
  if (fetched.y === today.y && fetched.m === today.m && fetched.d === today.d) return clock;
  return `${SHORT_DAYS[fetched.dow]} ${clock}`;
}

export function weatherCredit(model, fetchedAt, now) {
  if (!model) return '';
  const source = String(model).includes('bom_access_global')
    ? 'Open-Meteo / BOM model, Brookfield'
    : 'Open-Meteo, Brookfield';
  const when = formatUpdatedAt(fetchedAt, now || new Date());
  if (!when) return source;
  return `Updated ${when} · ${source}`;
}
