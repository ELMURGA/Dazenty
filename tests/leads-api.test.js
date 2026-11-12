import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Variables que lib/db.js lee al importarse
process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';
process.env.N8N_WEBHOOK_SECRET = 'n8n-secret';

// ── PostgREST de mentira, en memoria: solo lo que usan los endpoints probados ──
const db = {
  leads: [], clients: [], opportunities: [], activities: [],
  payments: [], invoices: [], projects: [], tasks: [], expenses: [], events: [],
};
const realFetch = globalThis.fetch;

function matches(row, key, cond) {
  const [op, ...rest] = cond.split('.');
  const val = rest.join('.');
  if (op === 'eq') return String(row[key]) === val;
  if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(row[key]));
  return true;
}
function filter(table, params) {
  let rows = db[table];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
    rows = rows.filter(r => matches(r, k, v));
  }
  const offset = Number(params.get('offset') || 0);
  const limit = Number(params.get('limit') || 1000);
  return rows.slice(offset, offset + limit);
}
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.host !== 'fake.supabase.test') return realFetch(url, init);
  if (u.pathname.startsWith('/rest/v1/rpc/')) return json(200, u.pathname.endsWith('check_rate_limit'));
  const table = u.pathname.replace('/rest/v1/', '');
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  if (method === 'GET') return json(200, filter(table, u.searchParams));
  if (method === 'POST') {
    if (table === 'clients' && db.clients.some(c => c.slug === body.slug)) return json(409, { code: '23505', message: 'duplicate' });
    const row = { id: randomUUID(), created_at: new Date().toISOString(), ...body };
    db[table].push(row);
    return json(201, [row]);
  }
  if (method === 'PATCH') {
    const rows = filter(table, u.searchParams);
    rows.forEach(r => Object.assign(r, body));
    return json(200, rows);
  }
  if (method === 'DELETE') {
    const gone = new Set(filter(table, u.searchParams));
    db[table] = db[table].filter(r => !gone.has(r));
    return json(204, null);
  }
  return json(405, {});
};

const { default: leads } = await import('../api/leads.js');
const { default: activities } = await import('../api/activities.js');
const { default: dashboard } = await import('../api/dashboard.js');
const { default: webhookLead } = await import('../api/webhook-lead.js');

async function call(handler, { method = 'GET', query = {}, body } = {}) {
  const res = {
    code: 200, body: undefined, headers: {},
    setHeader() {}, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; },
  };
  await handler({ method, query, body, headers: { 'x-admin-password': 'secret-pass' }, socket: {} }, res);
  return res;
}
const addLead = (over = {}) => {
  const lead = { id: randomUUID(), name: 'Bodegas Acosta', company: 'Bodegas Acosta', stage: 'propuesta', created_at: new Date().toISOString(), ...over };
  db.leads.push(lead);
  return lead;
};
const reset = () => { for (const k of Object.keys(db)) db[k] = []; };

test('registering a contact stores date, channel and a suggested follow-up, and logs it', async () => {
  reset();
  const lead = addLead();
  const res = await call(leads, { method: 'POST', query: { id: lead.id, action: 'contact' }, body: { channel: 'whatsapp', note: 'Pide rebajar el precio' } });
  assert.equal(res.code, 200);
  assert.equal(res.body.channel, 'whatsapp');
  assert.ok(res.body.last_contact_at);
  assert.match(res.body.next_followup_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(db.activities.length, 1);
  assert.match(db.activities[0].description, /por WhatsApp.*Pide rebajar el precio/);
  assert.equal(db.activities[0].entity_id, lead.id);
});

test('contacting a lead that was never contacted moves it to "contactada"; hot stages are kept', async () => {
  reset();
  const fresh = addLead({ stage: 'email_no_enviado' });
  const hot = addLead({ stage: 'reunion' });
  assert.equal((await call(leads, { method: 'POST', query: { id: fresh.id, action: 'contact' }, body: {} })).body.stage, 'contactada');
  assert.equal((await call(leads, { method: 'POST', query: { id: hot.id, action: 'contact' }, body: {} })).body.stage, 'reunion');
});

test('an explicit empty next follow-up clears the date', async () => {
  reset();
  const lead = addLead({ next_followup_at: '2026-11-01' });
  const res = await call(leads, { method: 'POST', query: { id: lead.id, action: 'contact' }, body: { next_followup_at: null } });
  assert.equal(res.body.next_followup_at, null);
});

test('contact and note reject bad input', async () => {
  reset();
  const lead = addLead();
  assert.equal((await call(leads, { method: 'POST', query: { id: lead.id, action: 'contact' }, body: { channel: 'paloma' } })).code, 400);
  assert.equal((await call(leads, { method: 'POST', query: { id: lead.id, action: 'contact' }, body: { next_followup_at: '2026-02-31' } })).code, 400);
  assert.equal((await call(leads, { method: 'POST', query: { id: lead.id, action: 'note' }, body: { note: '   ' } })).code, 400);
  assert.equal((await call(leads, { method: 'POST', query: { id: 'no-es-uuid', action: 'contact' }, body: {} })).code, 400);
  assert.equal((await call(leads, { method: 'POST', query: { id: randomUUID(), action: 'contact' }, body: {} })).code, 404);
});

test('notes go to the history without touching the lead', async () => {
  reset();
  const lead = addLead();
  const res = await call(leads, { method: 'POST', query: { id: lead.id, action: 'note' }, body: { note: 'Llamar tras la feria' } });
  assert.equal(res.code, 200);
  assert.equal(db.activities[0].action, 'note');
  assert.equal(db.leads[0].last_contact_at, undefined);
});

test('PUT validates follow-up fields, ignores last_contact_at and clears the date when closing', async () => {
  reset();
  const lead = addLead({ next_followup_at: '2026-11-20' });
  assert.equal((await call(leads, { method: 'PUT', query: { id: lead.id }, body: { temperature: 'hirviendo' } })).code, 400);
  const ok = await call(leads, { method: 'PUT', query: { id: lead.id }, body: { temperature: 'caliente', last_contact_at: '2020-01-01' } });
  assert.equal(ok.body.temperature, 'caliente');
  assert.equal(ok.body.last_contact_at, undefined);
  const closed = await call(leads, { method: 'PUT', query: { id: lead.id }, body: { stage: 'perdido' } });
  assert.equal(closed.body.next_followup_at, null);
});

test('converting creates the client and an opportunity, marks the lead as won and refuses a second time', async () => {
  reset();
  const lead = addLead({ name: 'Ana Pérez', company: 'Bodegas Acosta', email: 'ana@acosta.test', value_estimate: 900 });
  const res = await call(leads, { method: 'POST', query: { id: lead.id, action: 'convert' } });
  assert.equal(res.code, 201);
  assert.equal(res.body.client.slug, 'bodegas-acosta');
  assert.equal(db.opportunities[0].lead_id, lead.id);
  assert.equal(db.opportunities[0].value, 900);
  assert.equal(db.leads[0].stage, 'ganado');
  assert.equal(db.leads[0].converted_client_id, res.body.client.id);
  assert.equal((await call(leads, { method: 'POST', query: { id: lead.id, action: 'convert' } })).code, 409);
});

test('converting retries with a suffix when the slug already exists', async () => {
  reset();
  db.clients.push({ id: randomUUID(), slug: 'bodegas-acosta' });
  const lead = addLead({ company: 'Bodegas Acosta' });
  const res = await call(leads, { method: 'POST', query: { id: lead.id, action: 'convert' } });
  assert.equal(res.body.client.slug, 'bodegas-acosta-2');
});

test('bulk stage change validates the selection and updates every lead', async () => {
  reset();
  const [a, b, c] = [addLead({ stage: 'contactada' }), addLead({ stage: 'contactada' }), addLead({ stage: 'contactada' })];
  assert.equal((await call(leads, { method: 'PATCH', query: { action: 'bulk' }, body: { ids: [], stage: 'perdido' } })).code, 400);
  assert.equal((await call(leads, { method: 'PATCH', query: { action: 'bulk' }, body: { ids: ['x'], stage: 'perdido' } })).code, 400);
  assert.equal((await call(leads, { method: 'PATCH', query: { action: 'bulk' }, body: { ids: [a.id], stage: 'inventada' } })).code, 400);
  const tooMany = Array.from({ length: 201 }, () => randomUUID());
  assert.equal((await call(leads, { method: 'PATCH', query: { action: 'bulk' }, body: { ids: tooMany, stage: 'perdido' } })).code, 400);
  const res = await call(leads, { method: 'PATCH', query: { action: 'bulk' }, body: { ids: [a.id, b.id], stage: 'perdido' } });
  assert.equal(res.body.updated, 2);
  assert.deepEqual(db.leads.map(l => l.stage), ['perdido', 'perdido', 'contactada']);
  assert.equal(c.stage, 'contactada');
});

test('activities can be filtered by lead and reject malformed ids', async () => {
  reset();
  const lead = addLead();
  db.activities.push({ id: randomUUID(), entity_type: 'lead', entity_id: lead.id, action: 'note', description: 'a' },
    { id: randomUUID(), entity_type: 'lead', entity_id: randomUUID(), action: 'note', description: 'b' });
  const res = await call(activities, { query: { entity_type: 'lead', entity_id: lead.id } });
  assert.deepEqual(res.body.map(a => a.description), ['a']);
  assert.equal((await call(activities, { query: { entity_id: "x' or 1=1" } })).code, 400);
});

test('dashboard reads every lead (past the 1000-row page) and reports funnel and due follow-ups', async () => {
  reset();
  for (let i = 0; i < 1100; i++) addLead({ name: `L${i}`, stage: i < 1000 ? 'contactada' : 'email_no_enviado' });
  addLead({ name: 'Caliente', stage: 'propuesta', next_followup_at: '2020-01-01', value_estimate: 5000 });
  const res = await call(dashboard);
  assert.equal(res.code, 200);
  assert.equal(res.body.leads_total, 1101);
  assert.equal(res.body.embudo.counts.contactada, 1000);
  assert.equal(res.body.emails_sin_enviar, 100);
  assert.equal(res.body.seguimientos_total, 1);
  assert.equal(res.body.seguimientos[0].name, 'Caliente');
  assert.equal(res.body.leads_calientes, 1);
  assert.equal(res.body.valor_calientes, 5000);
});

test('n8n marking a lead as contactada stamps the contact once, as email, without scheduling a follow-up', async () => {
  reset();
  const lead = addLead({ stage: 'email_no_enviado', external_id: 'x1', company: 'Acme' });
  const callWebhook = async body => {
    const res = { code: 200, body: undefined, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await webhookLead({ method: 'POST', body, query: {}, headers: { 'x-webhook-secret': 'n8n-secret' }, socket: {} }, res);
    return res;
  };
  const first = await callWebhook({ action: 'update', external_id: 'x1', stage: 'contactada' });
  assert.equal(first.code, 200);
  assert.equal(first.body.channel, 'email');
  assert.ok(first.body.last_contact_at);
  assert.equal(first.body.next_followup_at, undefined);
  const stamp = first.body.last_contact_at;
  db.leads[0].channel = 'whatsapp';
  await callWebhook({ action: 'update', external_id: 'x1', stage: 'contactada', notes_append: 'reenvío' });
  assert.equal(db.leads[0].last_contact_at, stamp);
  assert.equal(db.leads[0].channel, 'whatsapp');
});

test('n8n mark_replied flags the lead as waiting for our answer, and false clears it', async () => {
  reset();
  addLead({ stage: 'contactada', external_id: 'r1', company: 'Acme' });
  const callWebhook = async body => {
    const res = { code: 200, body: undefined, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await webhookLead({ method: 'POST', body, query: {}, headers: { 'x-webhook-secret': 'n8n-secret' }, socket: {} }, res);
    return res;
  };
  const on = await callWebhook({ action: 'update', external_id: 'r1', mark_replied: true });
  assert.equal(on.code, 200);
  assert.equal(on.body.awaiting_reply, true);
  assert.ok(on.body.replied_at);
  assert.ok(db.activities.some(a => a.action === 'reply' && /vía n8n/.test(a.description)));
  const off = await callWebhook({ action: 'update', external_id: 'r1', mark_replied: false });
  assert.equal(off.body.awaiting_reply, false);
  // un update sin mark_replied no toca el aviso
  await callWebhook({ action: 'update', external_id: 'r1', mark_replied: true });
  await callWebhook({ action: 'update', external_id: 'r1', notes_append: 'nota' });
  assert.equal(db.leads[0].awaiting_reply, true);
});
