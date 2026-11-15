// One computer only. Phones share answers after the Cloudflare setup in the README.
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApi } from './api.js';
import { createStore } from './memory-store.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data', 'local.json');
const PORT = Number(process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};
const FILES = new Set([
  'index.html', 'styles.css', 'app.js', 'logic.js', 'weather.js', 'version.js', 'version.json', 'manifest.json',
  'robots.txt', 'icon-180.png', 'icon-192.png', 'icon-512.png',
]);

function localPin() {
  const fromEnv = process.env.ADMIN_PIN?.trim();
  if (fromEnv) return fromEnv;
  const file = path.join(ROOT, 'data', 'local-pin.txt');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const pin = String(Math.floor(100000 + Math.random() * 900000));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${pin}\n`, { mode: 0o600 });
  console.log('Local admin PIN written to data/local-pin.txt');
  return pin;
}

function createFileStore() {
  const saved = fs.existsSync(DATA) ? JSON.parse(fs.readFileSync(DATA, 'utf8')) : null;
  const store = createStore(saved);
  return Object.assign(store, {
    async flush() {
      fs.mkdirSync(path.dirname(DATA), { recursive: true });
      fs.writeFileSync(DATA, JSON.stringify(store.dump(), null, 2));
    },
  });
}

const store = createFileStore();
const bootstrapPin = localPin();

function send(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function serveApi(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
    else if (value != null) headers.set(key, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(`http://local${req.url}`, {
    method: req.method,
    headers,
    body: hasBody ? Buffer.concat(chunks) : undefined,
    ...(hasBody ? { duplex: 'half' } : {}),
  });
  const response = await handleApi(request, { store, bootstrapPin, now: () => new Date() });
  if (req.method !== 'GET' && req.method !== 'HEAD') await store.flush();
  const buffer = Buffer.from(await response.arrayBuffer());
  const out = {};
  response.headers.forEach((value, key) => { out[key] = value; });
  res.writeHead(response.status, out);
  res.end(buffer);
}

function serveFile(urlPath, res) {
  if (urlPath === '/config.js') {
    send(res, 200, 'window.TENNIS_CONFIG = { apiUrl: "" };\n', TYPES['.js']);
    return;
  }
  const name = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath.slice(1));
  if (!FILES.has(name)) {
    send(res, 404, 'Not found', TYPES['.txt']);
    return;
  }
  const file = path.join(ROOT, name);
  let body = fs.readFileSync(file);
  const ext = path.extname(name);
  if (ext === '.html' || ext === '.js') {
    body = body.toString('utf8').replaceAll('__VERSION__', 'dev');
  }
  send(res, 200, body, TYPES[ext] || TYPES['.txt']);
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname.startsWith('/api/')) {
    serveApi(req, res).catch((error) => {
      console.error(error);
      send(res, 500, 'Something went wrong.', TYPES['.txt']);
    });
    return;
  }
  serveFile(url.pathname, res);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Thursday tennis (this computer only): http://127.0.0.1:${PORT}`);
});
