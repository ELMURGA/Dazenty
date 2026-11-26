import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';

const fake = createFakeSupabase(['leads', 'clients', 'proposals', 'activities']);
fake.install();
const { db, storage } = fake;

const { proposalPdfPath } = await import('../lib/proposal-rules.js');
const { default: proposals } = await import('../api/proposals.js');
const { default: upload } = await import('../api/upload.js');

const PDF = Buffer.from('%PDF-1.4 prueba').toString('base64');
const put = async () => {
  await new Promise(r => setTimeout(r, 2)); // el nombre lleva la hora en milisegundos
  const r = await call(upload, { method: 'POST', body: { clientSlug: 'acme', docType: 'proposal', filename: 'a.pdf', data: PDF } });
  assert.equal(r.code, 200);
  return r.body.publicUrl;
};
const files = () => Object.keys(storage['client-docs'] || {});
const create = url => call(proposals, { method: 'POST', body: { client_id: 'c1', title: 'Web', url } });

test.beforeEach(() => fake.reset());

test('proposalPdfPath only recognises PDFs uploaded by the panel', () => {
  const base = 'https://x.supabase.co/storage/v1/object/public/client-docs/';
  assert.equal(proposalPdfPath(`${base}acme/proposal-12.pdf`), 'acme/proposal-12.pdf');
  for (const bad of [null, 'https://www.canva.com/d/abc', `${base}acme/invoice-1.pdf`, `${base}../x/proposal-1.pdf`, `${base}acme/proposal-1.pdf?x=1`]) assert.equal(proposalPdfPath(bad), null);
});

test('sign=1 returns a temporary link, 404 without PDF, and needs the password', async () => {
  const { body: p } = await create(await put());
  const ok = await call(proposals, { query: { id: p.id, sign: '1' } });
  assert.equal(ok.code, 200);
  assert.match(ok.body.url, /object\/sign\/client-docs\/acme\/proposal-\d+\.pdf/);
  assert.equal((await call(proposals, { query: { id: p.id, sign: '1' }, headers: {} })).code, 401);
  const { body: noPdf } = await create('https://www.canva.com/d/x');
  assert.equal((await call(proposals, { query: { id: noPdf.id, sign: '1' } })).code, 404);
});

test('replacing, removing and deleting clean up the old file', async () => {
  const first = await put();
  const { body: p } = await create(first);
  const second = await put();
  await call(proposals, { method: 'PUT', query: { id: p.id }, body: { url: second } });
  assert.deepEqual(files(), [proposalPdfPath(second)]);
  await call(proposals, { method: 'PUT', query: { id: p.id }, body: { status: 'vista' } });
  assert.equal(files().length, 1); // editar otra cosa no toca el PDF
  await call(proposals, { method: 'PUT', query: { id: p.id }, body: { url: null } });
  assert.deepEqual(files(), []);
  const third = await put();
  await call(proposals, { method: 'PUT', query: { id: p.id }, body: { url: third } });
  await call(proposals, { method: 'DELETE', query: { id: p.id } });
  assert.deepEqual(files(), []);
});

test('a file still used elsewhere is kept', async () => {
  const url = await put();
  const { body: a } = await create(url);
  db.clients.push({ id: 'c1', pdf_proposal_url: url });
  await call(proposals, { method: 'DELETE', query: { id: a.id } });
  assert.equal(files().length, 1);
});

test('/presupuesto never overwrites an uploaded PDF with a Canva link', async () => {
  db.clients.push({ id: 'c1', client_name: 'Acme', created_at: '2026-01-01' });
  const url = await put();
  await create(url);
  const r = await call(proposals, { method: 'POST', query: { action: 'register' }, body: { client_name: 'Acme', title: 'Web', url: 'https://www.canva.com/d/x', amount: 10 } });
  assert.equal(r.body.updated, true);
  assert.equal(db.proposals[0].url, url);
});
