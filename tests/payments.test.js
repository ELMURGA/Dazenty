import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { validatePayment } from '../lib/payment-validation.js';

const payment = {
  client_id: 'client-1', amount: 240, payment_method: 'efectivo',
  payment_date: '2026-10-02', service_concept: 'Mantenimiento y hosting',
  coverage_start: '2026-10-02', coverage_end: '2027-10-01',
};

test('accepts annual cash payments without an invoice and legacy invoice payments', () => {
  assert.equal(validatePayment(payment), null);
  assert.equal(validatePayment({ client_id: 'client-1', invoice_id: 'invoice-1', amount: 121 }), null);
  assert.equal(validatePayment({ ...payment, amount: '240.50' }), null);
});

test('rejects invalid amounts, dates, concepts and incomplete or reversed coverage', () => {
  for (const amount of [0, -1, Infinity, NaN, 'invalid', 0.001, 12.345, 1e10]) {
    assert.ok(validatePayment({ ...payment, amount }), String(amount));
  }
  for (const date of ['', null, '2026-02-30', 'not-a-date']) {
    assert.ok(validatePayment({ ...payment, payment_date: date }));
  }
  for (const changes of [
    { client_id: '' }, { coverage_start: null }, { coverage_end: null },
    { coverage_end: '2025-01-01' }, { coverage_start: '2026-02-30' },
    { service_concept: '' }, { service_concept: ' '.repeat(10) },
    { service_concept: 'a'.repeat(201) }, { service_concept: {} },
  ]) {
    assert.ok(validatePayment({ ...payment, ...changes }));
  }
});

test('UI proposes inclusive annual/monthly coverage, including leap years and month ends', () => {
  const html = fs.readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
  const source = html.match(/function updatePaymentCoverage\(\) \{[\s\S]*?\n\}/)[0];
  const fields = {
    'pay-period': { value: 'year' },
    'pay-coverageStart': { value: '2026-10-02' },
    'pay-coverageEnd': { value: '' },
    'pay-coverageFields': { style: {} },
  };
  const context = vm.createContext({ document: { getElementById: id => fields[id] } });
  vm.runInContext(source, context);
  for (const [period, start, end] of [
    ['year', '2026-10-02', '2027-10-01'],
    ['month', '2026-10-02', '2026-11-01'],
    ['year', '2024-02-29', '2025-02-27'],
    ['month', '2026-01-31', '2026-02-27'],
  ]) {
    fields['pay-period'].value = period;
    fields['pay-coverageStart'].value = start;
    vm.runInContext('updatePaymentCoverage()', context);
    assert.equal(fields['pay-coverageEnd'].value, end);
    assert.equal(fields['pay-coverageFields'].style.display, 'grid');
  }
  fields['pay-period'].value = 'custom';
  fields['pay-coverageEnd'].value = '2027-12-31';
  vm.runInContext('updatePaymentCoverage()', context);
  assert.equal(fields['pay-coverageEnd'].value, '2027-12-31');
  fields['pay-period'].value = 'none';
  vm.runInContext('updatePaymentCoverage()', context);
  assert.equal(fields['pay-coverageFields'].style.display, 'none');
});

test('API stores manual coverage and still recalculates linked invoice payments', async () => {
  process.env.SUPABASE_URL = 'https://database.example.test';
  process.env.SUPABASE_SERVICE_KEY = 'test-key';
  process.env.ADMIN_PASSWORD = 'test-password';
  const { default: handler } = await import('../api/payments.js');
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (url, options = {}) => {
    const table = new URL(url).pathname.split('/').pop();
    if (options.method === 'POST') {
      const body = JSON.parse(options.body);
      writes.push({ table, body });
      return Response.json([{ id: 'payment-1', ...body }]);
    }
    if (options.method === 'PATCH') {
      writes.push({ table, body: JSON.parse(options.body) });
      return Response.json([]);
    }
    if (table === 'invoices') return Response.json([{ id: 'invoice-1', client_id: 'client-1', total: 121, status: 'pendiente' }]);
    if (table === 'payments') return Response.json([{ amount: 121 }]);
    throw new Error(`Unexpected request: ${url}`);
  };
  const send = async body => {
    const res = {
      statusCode: 200, setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; },
    };
    await handler({ method: 'POST', query: {}, headers: { 'x-admin-password': 'test-password' }, body }, res);
    return res;
  };
  try {
    assert.equal((await send(payment)).statusCode, 201);
    assert.equal(writes[0].body.coverage_end, '2027-10-01');
    assert.equal(writes.filter(w => w.table === 'invoices').length, 0);
    assert.equal((await send({ client_id: 'client-1', invoice_id: 'invoice-1', amount: 121 })).statusCode, 201);
    assert.deepEqual(writes.find(w => w.table === 'invoices').body, { paid_amount: 121, status: 'pagada' });
    assert.equal((await send({ ...payment, invoice_id: 'invoice-1', client_id: 'wrong-client' })).statusCode, 400);
    assert.equal((await send({ ...payment, coverage_end: null })).statusCode, 400);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
