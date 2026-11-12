import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';

const fake = createFakeSupabase(['receivables', 'clients', 'payments', 'activities']);
fake.install();
const { db } = fake;

const {
  normalizeReceivable, receivableState, dueReceivables, summarizeReceivables, receivablesMessage,
} = await import('../lib/receivable-rules.js');
const { default: receivables } = await import('../api/receivables.js');

const TODAY = '2026-11-12';

test('normalizeReceivable validates concept, amount (2 decimals) and due date', () => {
  assert.equal(normalizeReceivable({ concept: ' ', amount: 10, due_date: TODAY }).error, 'El concepto es obligatorio');
  assert.match(normalizeReceivable({ concept: 'Web', amount: 0, due_date: TODAY }).error, /importe/);
  assert.match(normalizeReceivable({ concept: 'Web', amount: 10.123, due_date: TODAY }).error, /importe/);
  assert.match(normalizeReceivable({ concept: 'Web', amount: 10, due_date: '2026-02-31' }).error, /AAAA-MM-DD/);
  assert.match(normalizeReceivable({ concept: 'Web', amount: 10, due_date: TODAY, installment: 'tercera' }).error, /installment/);
  const ok = normalizeReceivable({ concept: ' Web ', amount: '200', due_date: TODAY, client_id: 'c1' });
  assert.deepEqual(ok.fields, { concept: 'Web', amount: 200, due_date: TODAY, client_id: 'c1' });
  // en edición solo se valida lo que llega
  assert.deepEqual(normalizeReceivable({ notes: 'hola' }, { partial: true }).fields, { notes: 'hola' });
  assert.match(normalizeReceivable({ status: 'raro' }, { partial: true }).error, /status/);
});

test('receivableState only treats pending items as open and counts days late', () => {
  assert.deepEqual(receivableState({ status: 'cobrado', due_date: '2020-01-01' }, TODAY), { open: false });
  assert.deepEqual(receivableState({ status: 'pendiente', due_date: TODAY }, TODAY), { open: true, overdue: false, today: true, days: 0 });
  assert.deepEqual(receivableState({ status: 'pendiente', due_date: '2026-11-09' }, TODAY), { open: true, overdue: true, today: false, days: 3 });
  assert.equal(receivableState({ status: 'pendiente', due_date: '2026-11-20' }, TODAY).overdue, false);
});

test('summary lists overdue first (most late first), then by due date, with totals', () => {
  const rows = [
    { id: 'a', status: 'pendiente', amount: 100, due_date: '2026-11-30' },
    { id: 'b', status: 'pendiente', amount: 50, due_date: '2026-11-10' },
    { id: 'c', status: 'pendiente', amount: 200, due_date: '2026-11-01' },
    { id: 'd', status: 'cobrado', amount: 999, due_date: '2026-10-01' },
    { id: 'e', status: 'pendiente', amount: 20.5, due_date: '2026-11-15' },
  ];
  const s = summarizeReceivables(rows, TODAY, 3);
  assert.deepEqual(s.items.map(r => r.id), ['c', 'b', 'e']);
  assert.equal(s.count, 4);
  assert.equal(s.total, 370.5);
  assert.equal(s.overdue_count, 2);
  assert.equal(s.overdue_total, 250);
});

test('dueReceivables keeps overdue and due-today, and the message names them', () => {
  const rows = [
    { id: 'a', status: 'pendiente', amount: 200, due_date: TODAY, concept: 'Segunda parte de la web', client_id: 'x' },
    { id: 'b', status: 'pendiente', amount: 50, due_date: '2026-12-01', concept: 'Hosting', client_id: 'y' },
  ];
  const due = dueReceivables(rows, TODAY);
  assert.deepEqual(due.map(r => r.id), ['a']);
  const msg = receivablesMessage(due, () => 'Almacenes Camu');
  assert.match(msg.title, /200/);
  assert.match(msg.body, /Almacenes Camu: 200 € · Segunda parte de la web/);
  assert.equal(receivablesMessage([]), null);
});

const addClient = (over = {}) => {
  const c = { id: randomUUID(), client_name: 'Almacenes Camu', slug: 'camu', ...over };
  db.clients.push(c);
  return c;
};

test('API: creates a pending receivable for a client and rejects invalid input', async () => {
  fake.reset();
  const c = addClient();
  const bad = await call(receivables, { method: 'POST', body: { concept: 'Web', amount: -5, due_date: TODAY, client_id: c.id } });
  assert.equal(bad.code, 400);
  const noClient = await call(receivables, { method: 'POST', body: { concept: 'Web', amount: 200, due_date: TODAY } });
  assert.equal(noClient.code, 400);
  const ok = await call(receivables, { method: 'POST', body: { concept: 'Segunda parte de la web', amount: 200, due_date: TODAY, client_id: c.id, status: 'cobrado' } });
  assert.equal(ok.code, 201);
  assert.equal(ok.body.status, 'pendiente'); // siempre nace pendiente
  const list = await call(receivables, { query: { status: 'pendiente' } });
  assert.equal(list.body.length, 1);
});

test('API: "cobrado" creates the payment, links it, and refuses a second time', async () => {
  fake.reset();
  const c = addClient();
  const r = (await call(receivables, { method: 'POST', body: { concept: 'Segunda parte de la web', amount: 200, due_date: TODAY, client_id: c.id } })).body;
  const done = await call(receivables, { method: 'POST', query: { id: r.id, action: 'cobrado' }, body: { payment_method: 'bizum', payment_date: TODAY } });
  assert.equal(done.code, 200);
  assert.equal(done.body.receivable.status, 'cobrado');
  assert.equal(done.body.receivable.payment_id, done.body.payment.id);
  assert.equal(db.payments.length, 1);
  assert.equal(db.payments[0].amount, 200);
  assert.equal(db.payments[0].payment_method, 'bizum');
  assert.equal(db.payments[0].service_concept, 'Segunda parte de la web');
  assert.equal(db.payments[0].client_id, c.id);
  const again = await call(receivables, { method: 'POST', query: { id: r.id, action: 'cobrado' }, body: {} });
  assert.equal(again.code, 409);
  assert.equal(db.payments.length, 1);
  assert.equal((await call(receivables, { method: 'PUT', query: { id: r.id }, body: { notes: 'x' } })).code, 409);
  assert.equal((await call(receivables, { method: 'DELETE', query: { id: r.id } })).code, 409);
});

test('API: a web installment keeps the web total so the payment is a valid "web" payment', async () => {
  fake.reset();
  const c = addClient();
  const r = (await call(receivables, { method: 'POST', body: { concept: 'Segunda parte', amount: 200, due_date: TODAY, client_id: c.id, installment: 'segunda_mitad', web_total: 400 } })).body;
  await call(receivables, { method: 'POST', query: { id: r.id, action: 'cobrado' }, body: {} });
  assert.equal(db.payments[0].payment_kind, 'web');
  assert.equal(db.payments[0].web_total, 400);
  assert.equal(db.payments[0].installment, 'segunda_mitad');
});

test('API: cancel via PUT, "cobrado" via PUT is refused, unknown ids fail cleanly', async () => {
  fake.reset();
  const c = addClient();
  const r = (await call(receivables, { method: 'POST', body: { concept: 'Hosting', amount: 50, due_date: TODAY, client_id: c.id } })).body;
  assert.equal((await call(receivables, { method: 'PUT', query: { id: r.id }, body: { status: 'cobrado' } })).code, 400);
  const cancelled = await call(receivables, { method: 'PUT', query: { id: r.id }, body: { status: 'cancelado' } });
  assert.equal(cancelled.body.status, 'cancelado');
  assert.equal((await call(receivables, { method: 'POST', query: { id: r.id, action: 'cobrado' }, body: {} })).code, 409);
  assert.equal((await call(receivables, { method: 'POST', query: { id: 'no-uuid', action: 'cobrado' }, body: {} })).code, 400);
  assert.equal((await call(receivables, { method: 'POST', query: { id: randomUUID(), action: 'cobrado' }, body: {} })).code, 404);
  assert.equal((await call(receivables, { method: 'DELETE', query: { id: r.id } })).code, 204);
});

test('API: requires the admin password', async () => {
  const res = await call(receivables, { headers: {} });
  assert.equal(res.code, 401);
});
