import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';

const fake = createFakeSupabase(['leads', 'clients', 'proposals', 'activities', 'opportunities', 'payments', 'invoices', 'projects', 'tasks', 'expenses', 'events', 'receivables']);
fake.install();
const { db } = fake;

const { normalizeProposal, proposalFollowup, proposalDueByLead } = await import('../lib/proposal-rules.js');
const { followupStatus, dueFollowups, leadPriority, followupsMessage } = await import('../lib/lead-rules.js');
const { default: proposals } = await import('../api/proposals.js');
const { default: leads } = await import('../api/leads.js');
const { default: dashboard } = await import('../api/dashboard.js');

const TODAY = '2026-11-12';

test('normalizeProposal requires title and an owner, and validates the rest', () => {
  assert.match(normalizeProposal({ lead_id: 'l1' }).error, /título/);
  assert.match(normalizeProposal({ title: 'Web' }).error, /lead o de un cliente/);
  assert.match(normalizeProposal({ title: 'Web', lead_id: 'l1', amount: -1 }).error, /importe/);
  assert.match(normalizeProposal({ title: 'Web', lead_id: 'l1', sent_at: '2026-13-01' }).error, /sent_at/);
  assert.match(normalizeProposal({ title: 'Web', lead_id: 'l1', channel: 'paloma' }).error, /channel/);
  assert.match(normalizeProposal({ title: 'Web', lead_id: 'l1', status: 'rara' }).error, /status/);
  assert.match(normalizeProposal({ title: 'Web', lead_id: 'l1', url: 'javascript:alert(1)' }).error, /http/);
  assert.match(normalizeProposal({ title: 'Web', lead_id: 'l1', url: 'no es url' }).error, /enlace/);
  const ok = normalizeProposal({ title: ' Web nueva ', lead_id: 'l1', amount: '450', sent_at: TODAY, url: 'https://x.test/p', channel: 'whatsapp' });
  assert.deepEqual(ok.fields, { title: 'Web nueva', lead_id: 'l1', amount: 450, sent_at: TODAY, url: 'https://x.test/p', channel: 'whatsapp' });
  assert.deepEqual(normalizeProposal({ status: 'vista' }, { partial: true }).fields, { status: 'vista' });
});

test('an open proposal with no movement for 5 days is due; closed ones never are', () => {
  const base = { status: 'enviada', sent_at: '2026-11-01', updated_at: '2026-11-07T10:00:00Z' };
  assert.equal(proposalFollowup(base, TODAY).due, true); // 5 días
  assert.equal(proposalFollowup(base, TODAY).reason, 'sin_movimiento');
  assert.equal(proposalFollowup({ ...base, updated_at: '2026-11-08T10:00:00Z' }, TODAY).due, false); // 4 días
  assert.equal(proposalFollowup({ ...base, status: 'vista' }, TODAY).due, true);
  for (const status of ['aceptada', 'rechazada', 'caducada']) assert.equal(proposalFollowup({ ...base, status }, TODAY).due, false);
  // con fecha de seguimiento manda la fecha
  assert.equal(proposalFollowup({ ...base, next_followup_at: '2026-11-20' }, TODAY).due, false);
  assert.deepEqual(proposalFollowup({ ...base, next_followup_at: TODAY }, TODAY), { due: true, overdueDays: 0, reason: 'hoy' });
  // sin updated_at usa la fecha de envío
  assert.equal(proposalFollowup({ status: 'enviada', sent_at: '2026-11-01' }, TODAY).due, true);
});

test('proposalDueByLead keeps the most delayed proposal per lead and ignores client proposals', () => {
  const props = [
    { id: 'p1', lead_id: 'L1', title: 'A', status: 'enviada', sent_at: '2026-11-05' },
    { id: 'p2', lead_id: 'L1', title: 'B', status: 'enviada', sent_at: '2026-10-20' },
    { id: 'p3', client_id: 'C1', title: 'C', status: 'enviada', sent_at: '2026-10-01' },
    { id: 'p4', lead_id: 'L2', title: 'D', status: 'aceptada', sent_at: '2026-10-01' },
  ];
  const map = proposalDueByLead(props, TODAY);
  assert.deepEqual([...map.keys()], ['L1']);
  assert.equal(map.get('L1').title, 'B');
});

test('awaiting_reply puts a lead first and survives any other state; closed leads never alert', () => {
  const waiting = { id: 'w', name: 'Ana', stage: 'nuevo', awaiting_reply: true, replied_at: '2026-11-10T09:00:00Z' };
  const s = followupStatus(waiting, TODAY);
  assert.deepEqual(s, { due: true, awaiting: true, overdueDays: 2, reason: 'respondio' });
  assert.equal(followupStatus({ ...waiting, stage: 'perdido' }, TODAY).due, false);
  const hot = { id: 'h', name: 'Hot', stage: 'reunion', temperature: 'caliente', value_estimate: 10000, next_followup_at: '2026-10-01' };
  const list = dueFollowups([hot, waiting], TODAY);
  assert.deepEqual(list.map(l => l.id), ['w', 'h']); // aunque el otro sea caliente y muy atrasado
  assert.ok(leadPriority(waiting, TODAY) > leadPriority(hot, TODAY));
  assert.match(followupsMessage(list).title, /esperando respuesta/);
  assert.match(followupsMessage(list).body, /Ha respondido: Ana/);
});

test('a stale proposal makes its lead due (reason "propuesta") and adds to other reasons', () => {
  const lead = { id: 'L1', name: 'Marta', stage: 'contactada' };
  const proposalDue = new Map([['L1', { overdueDays: 8, reason: 'sin_movimiento', title: 'Web' }]]);
  assert.equal(followupStatus(lead, TODAY).due, false);
  assert.deepEqual(followupStatus(lead, TODAY, { proposalDue }), { due: true, proposal: true, overdueDays: 8, reason: 'propuesta' });
  const withDate = { ...lead, next_followup_at: '2026-11-10' };
  const st = followupStatus(withDate, TODAY, { proposalDue });
  assert.equal(st.reason, 'vencido');
  assert.equal(st.overdueDays, 8);
  assert.equal(st.proposal, true);
});

const addLead = (over = {}) => {
  const l = { id: randomUUID(), name: 'Marta', company: 'Bodegas Acosta', stage: 'contactada', created_at: new Date().toISOString(), ...over };
  db.leads.push(l);
  return l;
};

test('API: sending a proposal moves an early lead to "propuesta" and logs it in the timeline', async () => {
  fake.reset();
  const lead = addLead();
  const res = await call(proposals, { method: 'POST', body: { lead_id: lead.id, title: 'Web corporativa', amount: 450 } });
  assert.equal(res.code, 201);
  assert.equal(res.body.status, 'enviada');
  assert.match(res.body.sent_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(db.leads[0].stage, 'propuesta');
  assert.equal(db.activities[0].entity_id, lead.id);
  assert.match(db.activities[0].description, /Propuesta enviada.*Web corporativa/);
  // un lead ya en reunión no retrocede
  const meet = addLead({ stage: 'reunion' });
  await call(proposals, { method: 'POST', body: { lead_id: meet.id, title: 'Otra' } });
  assert.equal(db.leads.find(l => l.id === meet.id).stage, 'reunion');
  assert.equal((await call(proposals, { method: 'POST', body: { title: 'Sin dueño' } })).code, 400);
  assert.equal((await call(proposals, { method: 'POST', body: { lead_id: 'no-uuid', title: 'x' } })).code, 400);
});

test('API: status changes are logged, filters work, delete removes', async () => {
  fake.reset();
  const lead = addLead();
  const p = (await call(proposals, { method: 'POST', body: { lead_id: lead.id, title: 'Web' } })).body;
  const q = (await call(proposals, { method: 'POST', body: { lead_id: lead.id, title: 'Logo' } })).body;
  const upd = await call(proposals, { method: 'PUT', query: { id: p.id }, body: { status: 'aceptada' } });
  assert.equal(upd.body.status, 'aceptada');
  assert.ok(db.activities.some(a => /Web.*aceptada/.test(a.description)));
  assert.equal((await call(proposals, { query: { open: '1' } })).body.length, 1);
  assert.equal((await call(proposals, { query: { status: 'aceptada' } })).body[0].id, p.id);
  assert.equal((await call(proposals, { query: { lead_id: lead.id } })).body.length, 2);
  assert.equal((await call(proposals, { method: 'PUT', query: { id: p.id }, body: { status: 'rara' } })).code, 400);
  assert.equal((await call(proposals, { method: 'PUT', query: { id: randomUUID() }, body: { status: 'vista' } })).code, 404);
  assert.equal((await call(proposals, { method: 'DELETE', query: { id: q.id } })).code, 204);
  assert.equal(db.proposals.length, 1);
});

test('API leads: "reply" marks and unmarks, registering a contact clears it', async () => {
  fake.reset();
  const lead = addLead();
  const on = await call(leads, { method: 'POST', query: { id: lead.id, action: 'reply' }, body: {} });
  assert.equal(on.body.awaiting_reply, true);
  assert.ok(on.body.replied_at);
  const contact = await call(leads, { method: 'POST', query: { id: lead.id, action: 'contact' }, body: { channel: 'whatsapp' } });
  assert.equal(contact.body.awaiting_reply, false);
  await call(leads, { method: 'POST', query: { id: lead.id, action: 'reply' }, body: {} });
  const off = await call(leads, { method: 'POST', query: { id: lead.id, action: 'reply' }, body: { awaiting: false } });
  assert.equal(off.body.awaiting_reply, false);
  // replied_at no se edita a mano
  const put = await call(leads, { method: 'PUT', query: { id: lead.id }, body: { replied_at: '2020-01-01' } });
  assert.notEqual(put.body.replied_at, '2020-01-01');
});

test('dashboard: replied leads and stale proposals feed "Hoy toca contactar"; receivables and renewals appear', async () => {
  fake.reset();
  const waiting = addLead({ name: 'Responde', stage: 'nuevo', awaiting_reply: true, replied_at: new Date().toISOString() });
  const stale = addLead({ name: 'Propuesta vieja', stage: 'contactada' });
  const quiet = addLead({ name: 'Tranquilo', stage: 'contactada' });
  db.proposals.push({ id: randomUUID(), lead_id: stale.id, title: 'Web', status: 'enviada', sent_at: '2020-01-01', updated_at: '2020-01-01T00:00:00Z' });
  const client = { id: randomUUID(), client_name: 'Almacenes Camu', status: 'active' };
  db.clients.push(client);
  db.receivables.push({ id: randomUUID(), client_id: client.id, concept: 'Segunda parte de la web', amount: 200, due_date: '2020-01-01', status: 'pendiente' });
  const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  db.payments.push({ id: randomUUID(), client_id: client.id, amount: 120, coverage_end: soon, service_concept: 'Mantenimiento y hosting', payment_date: '2025-12-01' });

  const res = await call(dashboard);
  assert.equal(res.code, 200);
  assert.deepEqual(res.body.seguimientos.map(l => l.name), ['Responde', 'Propuesta vieja']);
  assert.equal(res.body.seguimientos[0].followup.awaiting, true);
  assert.equal(res.body.seguimientos[1].proposal_title, 'Web');
  assert.equal(res.body.esperando_respuesta, 1);
  assert.equal(res.body.seguimientos.some(l => l.id === quiet.id), false);
  assert.equal(res.body.cobros_pendientes.count, 1);
  assert.equal(res.body.cobros_pendientes.total, 200);
  assert.equal(res.body.cobros_pendientes.overdue_count, 1);
  assert.equal(res.body.cobros_pendientes.items[0].client_name, 'Almacenes Camu');
  assert.deepEqual(res.body.propuestas_abiertas, { count: 1, total: 0, due: 1 });
  assert.equal(res.body.renovaciones.length, 1);
  assert.equal(res.body.renovaciones[0].client_name, 'Almacenes Camu');
  assert.equal(res.body.renovaciones[0].coverage_end, soon);
  assert.equal(waiting.id, res.body.seguimientos[0].id);
});

test('dashboard keeps working when the new tables are not migrated yet', async () => {
  fake.reset();
  delete fake.db.receivables;
  delete fake.db.proposals;
  addLead();
  const res = await call(dashboard);
  assert.equal(res.code, 200);
  assert.equal(res.body.cobros_pendientes.count, 0);
  assert.equal(res.body.propuestas_abiertas.count, 0);
});
