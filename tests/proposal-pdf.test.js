import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';

const fake = createFakeSupabase(['leads', 'clients', 'proposals', 'activities']);
fake.install();
const { db, storage } = fake;

const { proposalPdfPath, normalizeProposal } = await import('../lib/proposal-rules.js');
const { default: proposals } = await import('../api/proposals.js');
const { default: upload } = await import('../api/upload.js');

const sign = (over = {}, headers) => call(upload, { method: 'POST', body: { action: 'sign', clientSlug: 'acme', docType: 'proposal', filename: 'a.pdf', ...over }, ...(headers ? { headers } : {}) });
// Como el navegador: pide el enlace de subida y envía el archivo directamente a Storage
const put = async (name = 'a.pdf', content = '%PDF-1.4 prueba') => {
  const r = await sign();
  assert.equal(r.code, 200);
  await fetch(r.body.uploadUrl, { method: 'PUT', body: content });
  return { url: r.body.publicUrl, name };
};
const files = () => Object.keys(storage['client-docs'] || {}).sort();
const paths = (...list) => list.map(f => proposalPdfPath(f.url)).sort();
const create = (list, extra = {}) => call(proposals, { method: 'POST', body: { client_id: 'c1', title: 'Web', files: list, ...extra } });
const edit = (id, body) => call(proposals, { method: 'PUT', query: { id }, body });

test.beforeEach(() => fake.reset());

test('proposalPdfPath and files validation only accept PDFs stored for proposals', () => {
  const base = 'https://x.supabase.co/storage/v1/object/public/client-docs/';
  assert.equal(proposalPdfPath(`${base}acme/proposal-12.pdf`), 'acme/proposal-12.pdf');
  assert.equal(proposalPdfPath(`${base}acme/proposal-demo-20261125.pdf`), 'acme/proposal-demo-20261125.pdf');
  for (const bad of [null, 'https://www.canva.com/d/abc', `${base}acme/invoice-1.pdf`, `${base}../x/proposal-1.pdf`, `${base}acme/proposal-1.pdf?x=1`]) assert.equal(proposalPdfPath(bad), null);
  const v = files => normalizeProposal({ files }, { partial: true });
  assert.match(v('x').error, /lista/);
  assert.match(v([{ url: 'https://www.canva.com/d/x' }]).error, /panel/);
  assert.match(v(Array.from({ length: 11 }, (_, i) => ({ url: `${base}acme/proposal-${i}.pdf` }))).error, /hasta 10/);
  const one = { url: `${base}acme/proposal-1.pdf`, name: ' Panel.pdf ', size: 5, otro: true };
  assert.deepEqual(v([one, one]).fields.files, [{ url: one.url, name: 'Panel.pdf', size: 5 }]);
});

test('direct upload needs the password and only works for proposals', async () => {
  assert.equal((await sign({}, {})).code, 401);
  assert.equal((await sign({ docType: 'invoice' })).code, 400);
  assert.equal((await sign({ clientSlug: '../x' })).code, 400);
});

test('a proposal keeps several PDFs and each one opens with its own temporary link', async () => {
  const a = await put('Propuesta.pdf'); const b = await put('Panel.pdf');
  const { body: p, code } = await create([a, b]);
  assert.equal(code, 201);
  assert.deepEqual(p.files.map(f => f.name), ['Propuesta.pdf', 'Panel.pdf']);
  assert.ok(p.files[0].size > 0);
  const open = file => call(proposals, { query: { id: p.id, sign: '1', file } });
  assert.ok((await open(paths(b)[0])).body.url.includes(paths(b)[0]));
  assert.equal((await open('otro/proposal-1.pdf')).code, 404); // archivo de otra propuesta
  assert.equal((await call(proposals, { query: { id: p.id, sign: '1' }, headers: {} })).code, 401);
  const { body: empty } = await create([]);
  assert.equal((await call(proposals, { query: { id: empty.id, sign: '1' } })).code, 404);
});

test('a missing file or a fake PDF is rejected and the fake one is removed', async () => {
  const ghost = { url: 'https://fake.supabase.test/storage/v1/object/public/client-docs/acme/proposal-9.pdf', name: 'g.pdf' };
  assert.equal((await create([ghost])).code, 400);
  const bad = await put('virus.pdf', '<html>no</html>');
  const r = await create([bad]);
  assert.equal(r.code, 400);
  assert.match(r.body.error, /no es un PDF/);
  assert.deepEqual(files(), []);
  assert.equal(db.proposals.length, 0);
});

test('replacing, removing and deleting clean up only the dropped files', async () => {
  const a = await put(); const b = await put(); const c = await put();
  const { body: p } = await create([a, b]);
  await edit(p.id, { files: [a, c] });
  assert.deepEqual(files(), paths(a, c));
  await edit(p.id, { status: 'vista' }); // editar otra cosa no toca los PDF
  assert.deepEqual(files(), paths(a, c));
  await edit(p.id, { files: [c] });
  assert.deepEqual(files(), paths(c));
  await call(proposals, { method: 'DELETE', query: { id: p.id } });
  assert.deepEqual(files(), []);
});

test('a file still used elsewhere is kept', async () => {
  const shared = await put(); const portal = await put();
  const { body: first } = await create([shared, portal]);
  await create([shared]);
  db.clients.push({ id: 'c1', pdf_proposal_url: portal.url });
  await call(proposals, { method: 'DELETE', query: { id: first.id } });
  assert.deepEqual(files(), paths(shared, portal));
});

test('/presupuesto updating a proposal leaves its PDFs alone', async () => {
  db.clients.push({ id: 'c1', client_name: 'Acme', created_at: '2026-01-01' });
  const a = await put();
  await create([a]);
  const r = await call(proposals, { method: 'POST', query: { action: 'register' }, body: { client_name: 'Acme', title: 'Web', amount: 10 } });
  assert.equal(r.body.updated, true);
  assert.deepEqual(db.proposals[0].files.map(f => f.url), [a.url]);
});
