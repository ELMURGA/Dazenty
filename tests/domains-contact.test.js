import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';
process.env.N8N_WEBHOOK_SECRET = 'n8n-secret';
process.env.RESEND_API_KEY = 're_test';

const fake = createFakeSupabase(['leads', 'clients', 'domains', 'activities', 'opportunities']);
fake.install();
const { db } = fake;

// Intercepta Resend (el resto sigue yendo al Supabase de mentira)
const sentEmails = [];
const fakeFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.resend.com/')) {
    sentEmails.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: 'em_1' }), { status: 200 });
  }
  return fakeFetch(url, init);
};

const rules = await import('../lib/domain-rules.js');
const { isWhatsappContact, isEmailContact, contactChannels } = await import('../lib/lead-contact.js');
const { default: domains } = await import('../api/domains.js');
const { default: webhook } = await import('../api/webhook-lead.js');
const { default: leadsApi } = await import('../api/leads.js');

const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const today = day(0);

// ── Reglas de dominios ────────────────────────────────────────────────────────
test('normalizeDomain cleans the name and validates dates and price', () => {
  assert.equal(rules.normalizeDomain({ domain: 'https://WWW.Mi-Web.es/inicio', expires_at: '2027-03-01' }).fields.domain, 'www.mi-web.es');
  assert.ok(rules.normalizeDomain({ domain: 'sin punto', expires_at: '2027-03-01' }).error);
  assert.ok(rules.normalizeDomain({ domain: 'a.es', expires_at: 'mañana' }).error);
  assert.ok(rules.normalizeDomain({ domain: 'a.es', expires_at: '2027-03-01', renewal_price: '12,5x' }).error);
  assert.equal(rules.normalizeDomain({ domain: 'a.es', expires_at: '2027-03-01', renewal_price: '12.5' }).fields.renewal_price, 12.5);
  assert.deepEqual(rules.normalizeDomain({ registrar: ' IONOS ' }, { partial: true }).fields, { registrar: 'IONOS' });
});

test('domainStatus and alert stages: a month, a week, expired', () => {
  assert.equal(rules.domainStatus({ expires_at: day(60) }, today).stage, null);
  assert.equal(rules.domainStatus({ expires_at: day(30) }, today).stage, '30d');
  assert.equal(rules.domainStatus({ expires_at: day(7) }, today).stage, '7d');
  assert.equal(rules.domainStatus({ expires_at: day(0) }, today).state, 'urgent');
  assert.equal(rules.domainStatus({ expires_at: day(-1) }, today).stage, 'expired');
});

test('pendingDomainAlerts only reports a stage once, and escalates', () => {
  const d = { id: 'a', domain: 'a.es', expires_at: day(25), alert_stage: null };
  assert.equal(rules.pendingDomainAlerts([d], today).length, 1);
  assert.equal(rules.pendingDomainAlerts([{ ...d, alert_stage: '30d' }], today).length, 0);
  assert.equal(rules.pendingDomainAlerts([{ ...d, expires_at: day(5), alert_stage: '30d' }], today)[0].stage, '7d');
  assert.equal(rules.pendingDomainAlerts([{ ...d, expires_at: day(-2), alert_stage: '7d' }], today)[0].stage, 'expired');
  assert.equal(rules.pendingDomainAlerts([{ ...d, expires_at: day(90) }], today).length, 0);
  assert.equal(rules.pendingDomainAlerts([{ ...d, expires_at: day(-200) }], today).length, 0); // perdido hace mucho
});

test('portalDomains shows only the client domains that expire within a month', () => {
  const list = [
    { domain: 'a.es', expires_at: day(20), notify_client: true },
    { domain: 'b.es', expires_at: day(80), notify_client: true },
    { domain: 'c.es', expires_at: day(10), notify_client: false },
  ];
  assert.deepEqual(rules.portalDomains(list, today).map(d => d.domain), ['a.es']);
});

// ── API /api/domains ──────────────────────────────────────────────────────────
test('domains API: create, reject duplicates, list by expiry, renew resets the alerts', async () => {
  fake.reset();
  assert.equal((await call(domains, { method: 'POST', body: { domain: 'late.es', expires_at: day(200) } })).code, 201);
  const soon = await call(domains, { method: 'POST', body: { domain: 'soon.es', expires_at: day(20) } });
  assert.equal(soon.code, 201);
  assert.equal(soon.body.notify_client, true);
  assert.equal((await call(domains, { method: 'POST', body: { domain: 'soon.es', expires_at: day(20) } })).code, 409);
  assert.equal((await call(domains, { method: 'POST', body: { domain: 'x', expires_at: day(20) } })).code, 400);
  assert.equal((await call(domains, { method: 'POST', body: { domain: 'x.es', expires_at: day(20) }, headers: {} })).code, 401);

  const list = await call(domains);
  assert.equal(list.body.length, 2);

  db.domains.find(d => d.domain === 'soon.es').alert_stage = '30d';
  const renewed = await call(domains, { method: 'PUT', query: { id: soon.body.id }, body: { expires_at: day(385) } });
  assert.equal(renewed.body.alert_stage, null);
  const same = await call(domains, { method: 'PUT', query: { id: soon.body.id }, body: { registrar: 'IONOS' } });
  assert.equal(same.body.registrar, 'IONOS');
  assert.equal((await call(domains, { method: 'DELETE', query: { id: soon.body.id } })).code, 204);
});

test('domains API: manual notice emails the client and needs an email on file', async () => {
  fake.reset();
  sentEmails.length = 0;
  const client = { id: randomUUID(), client_name: 'Bodegas Acosta', client_contact_name: 'Ana Pérez', client_contact_email: 'ana@acosta.test', slug: 'bodegas-acosta', portal_token: 'tok' };
  db.clients.push(client);
  const d = (await call(domains, { method: 'POST', body: { domain: 'acosta.es', expires_at: day(20), client_id: client.id } })).body;
  const ok = await call(domains, { method: 'POST', query: { id: d.id, action: 'notify' } });
  assert.equal(ok.code, 200);
  assert.equal(sentEmails.length, 1);
  assert.deepEqual(sentEmails[0].to, ['ana@acosta.test']);
  assert.match(sentEmails[0].subject, /acosta\.es/);
  assert.match(sentEmails[0].html, /Hola Ana,/);
  assert.ok(db.domains[0].client_notified_at);

  client.client_contact_email = '';
  assert.equal((await call(domains, { method: 'POST', query: { id: d.id, action: 'notify' } })).code, 422);
});

// ── Canal de contacto: email y WhatsApp ───────────────────────────────────────
test('isWhatsappContact / isEmailContact read explicit flags and the old flows\' notes', () => {
  assert.equal(isWhatsappContact({ mark_whatsapp_contacted: true, stage: 'contactada' }), true);
  assert.equal(isWhatsappContact({ stage: 'contactada', notes_append: 'Contactado por WhatsApp (16/11/2026)' }), true);
  assert.equal(isWhatsappContact({ stage: 'contactada' }), false);
  assert.equal(isEmailContact({ stage: 'contactada' }), true);
  assert.equal(isEmailContact({ stage: 'contactada', notes_append: 'Contactado por WhatsApp' }), false);
  assert.equal(isEmailContact({ stage: 'contactada', notes_append: 'Email NO enviado: ya se le habia escrito antes' }), false);
  assert.equal(isEmailContact({ stage: 'perdido' }), false);
});

test('webhook: a WhatsApp contact after an email contact is reflected on the lead (both channels)', async () => {
  fake.reset();
  const lead = { id: randomUUID(), name: 'Tati', company: 'Tati', stage: 'nuevo', external_id: 'ext-1' };
  db.leads.push(lead);
  const hook = body => call(webhook, { method: 'POST', body, headers: { 'x-webhook-secret': 'n8n-secret' } });

  await hook({ action: 'update', external_id: 'ext-1', stage: 'contactada' });
  assert.equal(lead.channel, 'email');
  assert.ok(lead.email_contacted_at);
  assert.equal(lead.whatsapp_contacted_at, undefined);

  // El flujo antiguo solo manda la nota, sin mark_whatsapp_contacted
  await hook({ action: 'update', external_id: 'ext-1', stage: 'contactada', notes_append: 'Contactado por WhatsApp (16/11/2026)' });
  assert.equal(lead.channel, 'whatsapp');
  assert.ok(lead.whatsapp_contacted_at);
  assert.deepEqual(contactChannels(lead).map(c => c.key), ['email', 'whatsapp']);

  // Con la marca explícita y stage contactada (antes se guardaba como email)
  const fresh = { id: randomUUID(), name: 'Luna', company: 'Luna', stage: 'nuevo' };
  db.leads.push(fresh);
  await hook({ action: 'update', company: 'Luna', stage: 'contactada', mark_whatsapp_contacted: true });
  assert.equal(fresh.channel, 'whatsapp');
});

test('registering a contact by hand stamps the channel date', async () => {
  fake.reset();
  const lead = { id: randomUUID(), name: 'Ana', stage: 'nuevo' };
  db.leads.push(lead);
  await call(leadsApi, { method: 'POST', query: { id: lead.id, action: 'contact' }, body: { channel: 'whatsapp' } });
  assert.ok(lead.whatsapp_contacted_at);
  await call(leadsApi, { method: 'POST', query: { id: lead.id, action: 'contact' }, body: { channel: 'email' } });
  assert.ok(lead.email_contacted_at);
  assert.deepEqual(contactChannels(lead).map(c => c.key), ['email', 'whatsapp']);
});

test('GET /api/leads?slim=1 works and returns the lead list', async () => {
  fake.reset();
  db.leads.push({ id: randomUUID(), name: 'Ana', stage: 'nuevo', email_cuerpo: 'x'.repeat(100) });
  const r = await call(leadsApi, { query: { slim: '1' } });
  assert.equal(r.code, 200);
  assert.equal(r.body.length, 1);
});
