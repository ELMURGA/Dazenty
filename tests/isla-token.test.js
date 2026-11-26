import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, FAKE_HOST } from './helpers/fake-supabase.js';

const TOKEN = 'isla-test-token-0123456789-abcdefgh';
process.env.SUPABASE_URL = `https://${FAKE_HOST}`;
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';
process.env.ISLA_TASKS_TOKEN = TOKEN;

const fake = createFakeSupabase(['tasks', 'activities']);
fake.install();
const { default: tasks } = await import('../api/tasks.js');

async function call({ method = 'GET', query = {}, body, headers = { 'x-isla-token': TOKEN } } = {}) {
  const res = {
    code: 200, body: undefined,
    setHeader() {}, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; },
  };
  await tasks({ method, query, body, headers, socket: {} }, res);
  return res;
}

const row = over => ({ id: crypto.randomUUID(), title: 't', status: 'pendiente', priority: 'media',
  due_date: null, completed_at: null, description: 'privado', client_id: 'c1', ...over });

test('the Isla token lists open and recently finished tasks, only the needed fields', async () => {
  fake.reset();
  fake.db.tasks.push(
    row({ title: 'open' }),
    row({ title: 'recent', status: 'completada', completed_at: new Date().toISOString() }),
    row({ title: 'old', status: 'completada', completed_at: '2020-01-01T00:00:00.000Z' }),
    row({ title: 'cancelled', status: 'cancelada' }),
  );
  const res = await call();
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.map(t => t.title).sort(), ['open', 'recent']);
  assert.deepEqual(Object.keys(res.body[0]).sort(), ['completed_at', 'due_date', 'id', 'priority', 'status', 'title']);
});

test('it creates a task keeping only title and date', async () => {
  fake.reset();
  const res = await call({ method: 'POST', body: { title: '  Llamar  ', due_date: '2026-11-27', client_id: 'x', assigned_to: 'y' } });
  assert.equal(res.code, 201);
  assert.equal(fake.db.tasks[0].title, 'Llamar');
  assert.equal(fake.db.tasks[0].client_id, undefined);
  assert.equal(fake.db.tasks[0].assigned_to, undefined);
  assert.equal((await call({ method: 'POST', body: { title: '' } })).code, 400);
  assert.equal((await call({ method: 'POST', body: { title: 'x', due_date: 'mañana' } })).code, 400);
});

test('it ticks and unticks a task but changes nothing else', async () => {
  fake.reset();
  const t = row({ title: 'a' });
  fake.db.tasks.push(t);
  let res = await call({ method: 'PUT', query: { id: t.id }, body: { status: 'completada', title: 'hacked' } });
  assert.equal(res.code, 200);
  assert.equal(fake.db.tasks[0].title, 'a');
  assert.ok(fake.db.tasks[0].completed_at);
  res = await call({ method: 'PUT', query: { id: t.id }, body: { status: 'pendiente' } });
  assert.equal(fake.db.tasks[0].completed_at, null);
  assert.equal((await call({ method: 'PUT', query: { id: t.id }, body: { status: 'cancelada' } })).code, 400);
  assert.equal((await call({ method: 'PUT', query: { id: crypto.randomUUID() }, body: { status: 'completada' } })).code, 404);
});

test('it cannot delete, and a wrong token gets nothing', async () => {
  fake.reset();
  const t = row({});
  fake.db.tasks.push(t);
  assert.equal((await call({ method: 'DELETE', query: { id: t.id } })).code, 403);
  assert.equal(fake.db.tasks.length, 1);
  assert.equal((await call({ headers: { 'x-isla-token': 'wrong' } })).code, 401);
  // The token is not a password: sending it as one gets nothing either.
  assert.equal((await call({ headers: { 'x-admin-password': TOKEN } })).code, 401);
});

test('the admin password keeps working as before', async () => {
  fake.reset();
  fake.db.tasks.push(row({}));
  const res = await call({ headers: { 'x-admin-password': 'secret-pass' } });
  assert.equal(res.code, 200);
  assert.equal(res.body[0].description, 'privado');
});
