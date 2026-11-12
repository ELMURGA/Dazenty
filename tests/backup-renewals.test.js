import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';
process.env.CRON_SECRET = 'cron-secret';

const fake = createFakeSupabase(['leads', 'clients', 'payments', 'opportunities', 'tasks', 'events', 'activities',
  'receivables', 'proposals', 'message_templates', 'app_settings']);
fake.install();
const { db } = fake;

const { backupFileName, backupsToDelete, runBackup, BACKUP_TABLES, BACKUP_KEEP } = await import('../lib/backup.js');
const { upcomingRenewals } = await import('../lib/renewal-rules.js');
const { coverageRenewal, clientOpportunities } = await import('../lib/opportunity-rules.js');
const { default: backupCron } = await import('../api/backup-cron.js');

test('backupFileName uses Madrid time (DST aware) and sorts chronologically', () => {
  assert.equal(backupFileName(new Date('2026-11-12T02:10:00Z')), 'backup-2026-11-12-0310.json'); // invierno: UTC+1
  assert.equal(backupFileName(new Date('2026-07-12T02:10:00Z')), 'backup-2026-07-12-0410.json'); // verano: UTC+2
  assert.ok(backupFileName(new Date('2026-11-12T02:10:00Z')) < backupFileName(new Date('2026-11-13T02:10:00Z')));
});

test('backupsToDelete keeps the newest 30, only touches its own files', () => {
  const names = Array.from({ length: 33 }, (_, i) => `backup-2026-10-${String(i + 1).padStart(2, '0')}-0300.json`)
    .map(n => n.replace('-10-3', '-11-0')); // 33 nombres distintos y ordenados
  const unique = [...new Set(names)];
  const extra = ['notas.txt', 'backup-manual.json'];
  const gone = backupsToDelete([...unique, ...extra].reverse());
  assert.equal(gone.length, unique.length - BACKUP_KEEP);
  assert.deepEqual(gone, [...unique].sort().slice(0, gone.length)); // los más antiguos
  assert.ok(!gone.some(n => extra.includes(n)));
  assert.deepEqual(backupsToDelete(['backup-2026-11-12-0300.json']), []);
});

test('runBackup dumps every table to the private bucket and prunes old copies', async () => {
  fake.reset();
  for (let i = 0; i < 1200; i++) db.leads.push({ id: randomUUID(), name: `L${i}` }); // más de una página de 1000
  db.clients.push({ id: randomUUID(), client_name: 'Camu' });
  fake.storage.backups = {};
  for (let i = 1; i <= 30; i++) fake.storage.backups[`backup-2026-10-${String(i).padStart(2, '0')}-0300.json`] = '{}';
  fake.storage.backups['otro-archivo.txt'] = 'x';

  const r = await runBackup(new Date('2026-11-12T02:10:00Z'));
  assert.equal(r.file, 'backup-2026-11-12-0310.json');
  assert.equal(r.counts.leads, 1200);
  assert.equal(r.counts.clients, 1);
  assert.deepEqual(r.errors, []);
  assert.equal(r.deleted, 1);
  const names = Object.keys(fake.storage.backups);
  assert.ok(names.includes('otro-archivo.txt'));
  assert.ok(!names.includes('backup-2026-10-01-0300.json'));
  const saved = JSON.parse(fake.storage.backups[r.file]);
  assert.equal(saved.data.leads.length, 1200);
  assert.deepEqual(Object.keys(saved.data).sort(), [...BACKUP_TABLES].sort());
});

test('runBackup survives a table that cannot be read and reports it by name only', async () => {
  fake.reset();
  delete fake.db.proposals;
  const logs = [];
  const spy = mock.method(console, 'error', (...a) => logs.push(a.join(' ')));
  const r = await runBackup(new Date('2026-11-12T02:10:00Z'));
  spy.mock.restore();
  assert.deepEqual(r.errors, ['proposals']);
  assert.ok(!('proposals' in JSON.parse(fake.storage.backups[r.file]).data));
});

test('backup-cron: the cron secret or the admin password can run it; anything else cannot', async () => {
  fake.reset();
  db.clients.push({ id: randomUUID(), client_name: 'Camu', portal_token: 'secreto-del-portal' });
  assert.equal((await call(backupCron, { method: 'POST', headers: {} })).code, 401);
  assert.equal((await call(backupCron, { method: 'POST', headers: { authorization: 'Bearer mal' } })).code, 401);

  const cron = await call(backupCron, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } });
  assert.equal(cron.code, 200);
  assert.equal(cron.body.last.source, 'automatica');
  assert.equal(Object.keys(fake.storage.backups).length, 1);

  const manual = await call(backupCron, { method: 'POST' });
  assert.equal(manual.code, 200);
  assert.equal(manual.body.last.source, 'manual');

  const status = await call(backupCron, { method: 'GET' });
  assert.equal(status.code, 200);
  assert.equal(status.body.last.source, 'manual');
  assert.ok(status.body.last.at);
  // la respuesta y lo guardado en ajustes llevan recuentos, nunca filas
  assert.ok(!JSON.stringify(status.body).includes('secreto-del-portal'));
  assert.ok(!JSON.stringify(db.app_settings).includes('secreto-del-portal'));
});

test('backup-cron without CRON_SECRET configured refuses cron calls but the admin still works', async () => {
  fake.reset();
  const saved = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal((await call(backupCron, { method: 'GET', headers: { authorization: 'Bearer cron-secret' } })).code, 401);
  assert.equal((await call(backupCron, { method: 'POST' })).code, 200);
  process.env.CRON_SECRET = saved;
});

const TODAY = '2026-11-12';
const client = (over = {}) => ({ id: 'c1', client_name: 'Camu', status: 'active', ...over });
const pay = (end, over = {}) => ({ client_id: 'c1', amount: 120, coverage_end: end, service_concept: 'Mantenimiento', ...over });

test('upcomingRenewals lists coverage ending in the next 60 days, soonest first', () => {
  const clients = [client(), client({ id: 'c2', client_name: 'Otra' }), client({ id: 'c3', client_name: 'Lejos' })];
  const payments = [pay('2026-12-20'), pay('2026-11-20', { client_id: 'c2' }), pay('2027-03-01', { client_id: 'c3' })];
  const r = upcomingRenewals(clients, payments, TODAY);
  assert.deepEqual(r.map(x => x.client_name), ['Otra', 'Camu']);
  assert.equal(r[0].days_left, 8);
  assert.equal(r[0].expired, false);
  assert.equal(r[1].service, 'Mantenimiento');
});

test('upcomingRenewals keeps recently expired ones, skips stripe subscribers, inactive clients and renewed services', () => {
  const clients = [client({ stripe_subscription_id: 'sub_1', stripe_subscription_status: 'active' }),
    client({ id: 'c2', status: 'inactive' }), client({ id: 'c3' }), client({ id: 'c4' })];
  const payments = [pay('2026-12-01'), pay('2026-12-01', { client_id: 'c2' }),
    pay('2026-11-01', { client_id: 'c3' }), // venció hace 11 días: sigue saliendo
    pay('2026-06-01', { client_id: 'c4' }), pay('2027-11-01', { client_id: 'c4' })]; // renovado hasta 2027: se usa el último
  const r = upcomingRenewals(clients, payments, TODAY);
  assert.deepEqual(r.map(x => x.client_id), ['c3']);
  assert.equal(r[0].expired, true);
});

test('the renewal block and the auto-opportunity share the same rule (no duplicated logic)', () => {
  const c = client();
  const payments = [pay('2026-12-20')];
  const rule = coverageRenewal(c, payments, TODAY, { daysBefore: 45 });
  const opp = clientOpportunities(c, { payments }, TODAY).find(o => o.auto_key.startsWith('renewal:'));
  assert.equal(opp.auto_key, `renewal:${rule.coverage_end}`);
  // 60 días antes aparece en el Inicio pero todavía no genera oportunidad (esa avisa desde 45)
  const far = [pay('2027-01-05')];
  assert.ok(coverageRenewal(c, far, TODAY, { daysBefore: 60 }));
  assert.equal(coverageRenewal(c, far, TODAY, { daysBefore: 45 }), null);
  assert.equal(clientOpportunities(c, { payments: far }, TODAY).some(o => o.auto_key.startsWith('renewal:')), false);
});
