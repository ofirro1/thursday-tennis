// Prints the D1 database id. Creates the database the first time.
import { execFileSync } from 'node:child_process';

const wrangler = ['--yes', 'wrangler@3.91.0'];

function run(args) {
  return execFileSync('npx', [...wrangler, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function databaseId(list) {
  const rows = Array.isArray(list) ? list : list.result || list.databases || [];
  const found = rows.find((row) => row.name === 'thursday-tennis' || row.database_name === 'thursday-tennis');
  return found?.uuid || found?.database_id || '';
}

let listed = '';
try {
  listed = run(['d1', 'list', '--json']);
} catch (error) {
  console.error(error.stderr || error.message);
  process.exit(1);
}

const jsonStart = listed.indexOf('[') === -1 ? listed.indexOf('{') : listed.indexOf('[');
let existing = '';
if (jsonStart !== -1) {
  try {
    existing = databaseId(JSON.parse(listed.slice(jsonStart)));
  } catch {
    existing = '';
  }
}

if (existing) {
  process.stdout.write(existing);
  process.exit(0);
}

let created = '';
try {
  created = run(['d1', 'create', 'thursday-tennis']);
} catch (error) {
  const text = `${error.stdout || ''}\n${error.stderr || ''}`;
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!match) {
    console.error(error.stderr || error.message);
    process.exit(1);
  }
  process.stdout.write(match[0]);
  process.exit(0);
}

const match = created.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
if (!match) {
  console.error(created);
  process.exit(1);
}
process.stdout.write(match[0]);
