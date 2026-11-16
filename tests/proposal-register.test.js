import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';

const fake = createFakeSupabase(['leads', 'clients', 'proposals', 'activities']);
fake.install();
const { db } = fake;

const { normalizeName, pickOwner } = await import('../lib/proposal-owner.js');
const { default: proposals } = await import('../api/proposals.js');

const reg = body => call(proposals, { method: 'POST', query: { action: 'register' }, body });
const lead = (over = {}) => { const l = { id: randomUUID(), name: 'Contacto', company: 'Bodegas Acosta', stage: 'contactada', created_at: new Date().toISOString(), ...over }; db.leads.push(l); return l; };

test('normalizeName ignores case, accents, punctuation and legal suffixes', () => {
  assert.equal(normalizeName('Bodegas Acosta, S.L.'), 'bodegas acosta');
  assert.equal(normalizeName('  BODEGAS   ACOSTA SL'), 'bodegas acosta');
  assert.equal(normalizeName('Taragüi'), 'taragui');
  assert.equal(normalizeName('Acme LLC'), 'acme');
  assert.equal(normalizeName(null), '');
});

test('pickOwner: exact open lead > client > closed lead > single partial; several = ambiguous', () => {
  const L = (id, company, stage = 'contactada') => ({ id, company, name: 'x', stage, created_at: id });
  const C = (id, name) => ({ id, client_name: name });
  assert.equal(pickOwner('bodegas acosta', [L('1', 'Bodegas Acosta S.L.')], []).row.id, '1');
  assert.equal(pickOwner('Camu', [], [C('c1', 'Almacenes Camu')]).row.id, 'c1'); // parcial única
  assert.equal(pickOwner('Almacenes Camu', [L('1', 'Almacenes Camu', 'perdido')], [C('c1', 'Almacenes Camu')]).type, 'client');
  assert.equal(pickOwner('Almacenes Camu', [L('1', 'Almacenes Camu', 'perdido')], []).type, 'lead');
  assert.equal(pickOwner('Acosta', [L('1', 'Bodegas Acosta'), L('2', 'Vinos Acosta')], []).type, 'ambiguous');
  assert.equal(pickOwner('Acosta SL', [L('1', 'Acosta'), L('2', 'Acosta')], []).type, 'ambiguous');
  assert.equal(pickOwner('Nada', [L('1', 'Bodegas Acosta')], []).type, 'none');
  assert.equal(pickOwner('', [L('1', 'x')], []).type, 'none');
});

test('register links the proposal to the matching lead, moves it to "propuesta" and keeps the Canva link', async () => {
  fake.reset();
  const l = lead();
  const r = await reg({ client_name: 'Bodegas Acosta', title: 'PROPUESTA BODEGAS ACOSTA', amount: 1100, url: 'https://www.canva.com/design/DAXXXX/edit' });
  assert.equal(r.code, 201);
  assert.equal(r.body.owner, 'lead');
  assert.equal(r.body.proposal.lead_id, l.id);
  assert.equal(r.body.proposal.amount, 1100);
  assert.equal(r.body.proposal.url, 'https://www.canva.com/design/DAXXXX/edit');
  assert.equal(r.body.proposal.status, 'enviada');
  assert.equal(db.leads[0].stage, 'propuesta');
  assert.ok(db.activities.some(a => a.entity_id === l.id && /Canva/.test(a.description)));
});

test('register twice for the same client updates the open proposal instead of duplicating it', async () => {
  fake.reset();
  lead();
  await reg({ client_name: 'Bodegas Acosta', title: 'Propuesta Bodegas Acosta', amount: 1100, url: 'https://canva.com/a' });
  const again = await reg({ client_name: 'bodegas acosta s.l.', title: 'PROPUESTA BODEGAS ACOSTA', amount: 1300, url: 'https://canva.com/b' });
  assert.equal(again.code, 200);
  assert.equal(again.body.updated, true);
  assert.equal(db.proposals.length, 1);
  assert.equal(db.proposals[0].amount, 1300);
  assert.equal(db.proposals[0].url, 'https://canva.com/b');
});

test('register for an existing client attaches it to the client, not to a lead', async () => {
  fake.reset();
  db.clients.push({ id: 'cl-1', client_name: 'Almacenes Camu', slug: 'camu' });
  const r = await reg({ client_name: 'Almacenes Camu', amount: 400 });
  assert.equal(r.body.owner, 'client');
  assert.equal(r.body.proposal.client_id, 'cl-1');
  assert.equal(r.body.proposal.title, 'Propuesta Almacenes Camu');
  assert.equal(db.leads.length, 0);
});

test('register with no match creates the lead so nothing is left uncontrolled', async () => {
  fake.reset();
  const r = await reg({ client_name: 'Floristería Luna', amount: 650 });
  assert.equal(r.code, 201);
  assert.equal(r.body.created_lead, true);
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].stage, 'propuesta');
  assert.equal(db.leads[0].source, 'presupuesto');
  assert.equal(r.body.proposal.lead_id, db.leads[0].id);
});

test('register with several candidates answers 409 with the list and writes nothing', async () => {
  fake.reset();
  lead({ company: 'Bodegas Acosta' });
  lead({ company: 'Vinos Acosta' });
  const r = await reg({ client_name: 'Acosta' });
  assert.equal(r.code, 409);
  assert.equal(r.body.candidates.length, 2);
  assert.equal(db.proposals.length, 0);
  assert.equal(db.leads.length, 2);
});

test('register validates input and requires the admin password', async () => {
  fake.reset();
  assert.equal((await reg({})).code, 400);
  assert.equal((await reg({ client_name: 'X' })).code, 400);
  assert.equal((await reg({ client_name: 'Acme Co', url: 'javascript:alert(1)' })).code, 400);
  assert.equal((await call(proposals, { method: 'POST', query: { action: 'register' }, body: { client_name: 'Acme Co' }, headers: {} })).code, 401);
  assert.equal(db.proposals.length, 0);
  assert.equal(db.leads.length, 0); // y no se crea ningún lead suelto
});
