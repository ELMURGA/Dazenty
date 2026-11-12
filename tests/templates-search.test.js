import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase, callHandler as call } from './helpers/fake-supabase.js';

process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';

const fake = createFakeSupabase(['leads', 'clients', 'tasks', 'opportunities', 'message_templates', 'activities']);
fake.install();
const { db } = fake;

const { normalizeTemplate, fillTemplate, formatEuros, whatsappLink, firstName } = await import('../lib/message-templates.js');
const { sanitizeSearch, buildOrFilter } = await import('../lib/search.js');
const { default: search } = await import('../api/search.js');
const { default: templates } = await import('../api/message-templates.js');

test('fillTemplate replaces the four variables and reports the ones without a value', () => {
  const body = 'Hola {nombre}, de {empresa}: {importe}. {enlace} y otra vez {nombre}';
  const r = fillTemplate(body, { nombre: 'Ana', empresa: 'Acosta', importe: '200 €', enlace: '' });
  assert.equal(r.text, 'Hola Ana, de Acosta: 200 €. {enlace} y otra vez Ana');
  assert.deepEqual(r.missing, ['enlace']);
  assert.deepEqual(fillTemplate('Sin variables', {}).missing, []);
  assert.equal(fillTemplate('{desconocida}', { desconocida: 'x' }).text, '{desconocida}'); // solo las cuatro
});

test('fillTemplate does not double the final dot of a value ("S.L.")', () => {
  assert.equal(fillTemplate('Hola de {empresa}. Adiós', { empresa: 'Acosta S.L.' }).text, 'Hola de Acosta S.L. Adiós');
  assert.equal(fillTemplate('Hola de {empresa}, adiós', { empresa: 'Acosta S.L.' }).text, 'Hola de Acosta S.L., adiós');
  assert.equal(fillTemplate('{nombre}.', { nombre: 'Ana' }).text, 'Ana.');
});

test('formatEuros, firstName and whatsappLink', () => {
  assert.equal(formatEuros(200), '200 €');
  assert.equal(formatEuros(35.5), '35,5 €');
  assert.equal(firstName('Ana Pérez López'), 'Ana');
  assert.equal(firstName(''), '');
  assert.equal(whatsappLink('657 123 456'), 'https://wa.me/34657123456');
  assert.equal(whatsappLink('+34 657 123 456', 'Hola Ana, ¿qué tal?'), 'https://wa.me/34657123456?text=Hola%20Ana%2C%20%C2%BFqu%C3%A9%20tal%3F');
  assert.equal(whatsappLink('0034657123456'), 'https://wa.me/34657123456');
  assert.equal(whatsappLink('56912345678'), 'https://wa.me/56912345678');
  assert.equal(whatsappLink('12345'), '');
  assert.equal(whatsappLink(null), '');
});

test('normalizeTemplate validates name, body, category and active', () => {
  assert.match(normalizeTemplate({ name: '', body: 'x' }).error, /nombre/);
  assert.match(normalizeTemplate({ name: 'a', body: ' ' }).error, /texto/);
  assert.match(normalizeTemplate({ name: 'a', body: 'x'.repeat(2001) }).error, /2000/);
  assert.match(normalizeTemplate({ name: 'a', body: 'x', category: 'rara' }).error, /category/);
  assert.deepEqual(normalizeTemplate({ name: ' Hola ', body: ' Texto ', category: 'cobro', active: false }).fields,
    { name: 'Hola', body: 'Texto', category: 'cobro', active: false });
  assert.deepEqual(normalizeTemplate({ active: false }, { partial: true }).fields, { active: false });
});

test('templates API: CRUD, duplicate names are refused, ?active=1 filters', async () => {
  fake.reset();
  const a = await call(templates, { method: 'POST', body: { name: 'Primer contacto', body: 'Hola {nombre}', category: 'lead' } });
  assert.equal(a.code, 201);
  assert.equal((await call(templates, { method: 'POST', body: { name: 'Primer contacto', body: 'Otra' } })).code, 409);
  assert.equal((await call(templates, { method: 'POST', body: { name: 'Sin texto' } })).code, 400);
  const b = await call(templates, { method: 'POST', body: { name: 'Antigua', body: 'x', active: false } });
  assert.equal((await call(templates, { query: { active: '1' } })).body.length, 1);
  assert.equal((await call(templates, {})).body.length, 2);
  const upd = await call(templates, { method: 'PUT', query: { id: a.body.id }, body: { body: 'Hola {nombre}, qué tal' } });
  assert.equal(upd.body.body, 'Hola {nombre}, qué tal');
  assert.equal((await call(templates, { method: 'DELETE', query: { id: b.body.id } })).code, 204);
});

test('sanitizeSearch strips filter syntax and escapes LIKE wildcards', () => {
  assert.equal(sanitizeSearch('  Bodegas   Acosta '), 'Bodegas Acosta');
  assert.equal(sanitizeSearch('a,b)(c*"d\\'), 'a b c d');
  assert.equal(sanitizeSearch('100%_off'), '100\\%\\_off');
  assert.equal(sanitizeSearch('x'.repeat(200)).length, 60);
});

test('buildOrFilter covers the right fields and adds digits for phone-like queries', () => {
  const f = buildOrFilter('leads', 'Acosta');
  for (const field of ['name', 'company', 'email', 'phone', 'whatsapp', 'instagram', 'notes']) assert.ok(f.includes(`${field}.ilike.*Acosta*`), field);
  assert.equal(buildOrFilter('leads', 'a'), '');
  assert.equal(buildOrFilter('nada', 'Acosta'), '');
  assert.ok(buildOrFilter('leads', '657 12 34').includes('phone.ilike.*6571234*'));
  assert.ok(!buildOrFilter('clients', '657 12 34').includes('phone.ilike'));
  assert.ok(!buildOrFilter('leads', 'Acosta').includes('phone.ilike.*Acosta*,phone'));
});

test('search API finds across leads, clients, tasks and opportunities, max 8 each', async () => {
  fake.reset();
  for (let i = 0; i < 1500; i++) db.leads.push({ id: randomUUID(), name: `Lead ${i}`, company: i % 3 === 0 ? 'Empresa Común' : null, stage: 'nuevo', updated_at: new Date(i * 1000).toISOString() });
  db.leads.push({ id: randomUUID(), name: 'Marta', company: 'Bodegas Acosta', whatsapp: '34657123456', stage: 'propuesta', notes: 'quiere web nueva', updated_at: new Date().toISOString() });
  db.clients.push({ id: randomUUID(), client_name: 'Acosta Vinos', slug: 'acosta' });
  db.tasks.push({ id: randomUUID(), title: 'Llamar a Acosta', status: 'pendiente' });
  db.opportunities.push({ id: randomUUID(), title: 'Proyecto Acosta' });

  const r = await call(search, { query: { q: 'acosta' } });
  assert.equal(r.code, 200);
  assert.equal(r.body.leads.length, 1);
  assert.equal(r.body.leads[0].company, 'Bodegas Acosta');
  assert.equal(r.body.clients[0].client_name, 'Acosta Vinos');
  assert.equal(r.body.tasks[0].title, 'Llamar a Acosta');
  assert.equal(r.body.opportunities[0].title, 'Proyecto Acosta');

  const many = await call(search, { query: { q: 'empresa' } });
  assert.equal(many.body.leads.length, 8); // 500 coinciden, solo 8 vuelven
  assert.equal((await call(search, { query: { q: '657 123' } })).body.leads[0].name, 'Marta'); // por teléfono con espacios
  assert.equal((await call(search, { query: { q: 'web nueva' } })).body.leads[0].name, 'Marta'); // por notas
});

test('search API: short query is refused and wildcards are literal characters', async () => {
  fake.reset();
  db.leads.push({ id: randomUUID(), name: 'Ana', stage: 'nuevo' }, { id: randomUUID(), name: '100% Natural', stage: 'nuevo' });
  assert.equal((await call(search, { query: { q: 'a' } })).code, 400);
  assert.equal((await call(search, { query: { q: ' ' } })).code, 400);
  assert.equal((await call(search, { query: {} })).code, 400);
  const pct = await call(search, { query: { q: '%%' } });
  assert.equal(pct.body.leads.length, 0); // "%%" no es "todo"
  assert.equal((await call(search, { query: { q: '100%' } })).body.leads[0].name, '100% Natural');
  assert.equal((await call(search, { query: { q: "x'),or(id.neq.0" } })).code, 200); // no rompe el filtro
  assert.equal((await call(search, { method: 'POST', query: { q: 'ana' } })).code, 405);
  assert.equal((await call(search, { headers: {}, query: { q: 'ana' } })).code, 401);
});
