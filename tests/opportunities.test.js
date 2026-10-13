import test from 'node:test';
import assert from 'node:assert/strict';
import { clientOpportunities } from '../lib/opportunity-rules.js';

const TODAY = '2026-10-13';
const base = { id: 'c1', client_name: 'Ana', service_name: 'Web', status: 'active' };
const keys = (client, ctx) => clientOpportunities(client, ctx, TODAY).map(o => o.auto_key);
const unix = iso => Math.floor(new Date(`${iso}T00:00:00Z`).getTime() / 1000);

test('inactive clients only get a reactivation opportunity', () => {
  assert.deepEqual(keys({ ...base, status: 'inactive', stripe_subscription_status: 'past_due', amount_monthly: 50 }), ['reactivate']);
});

test('subscription state maps to recovery, retention, win-back and annual upgrade', () => {
  const sub = { ...base, amount_monthly: 50, stripe_subscription_id: 'sub_1' };
  assert.deepEqual(keys({ ...sub, stripe_subscription_status: 'past_due' }), ['recover_payment:sub_1']);
  assert.deepEqual(keys({ ...sub, stripe_subscription_status: 'canceling' }), ['retain:sub_1']);
  assert.deepEqual(keys({ ...sub, stripe_subscription_status: 'canceled' }), ['winback:sub_1']);
  const [upgrade] = clientOpportunities({ ...sub, stripe_subscription_status: 'active', stripe_current_period_end: unix('2026-11-01') }, {}, TODAY);
  assert.equal(upgrade.auto_key, 'annual_upgrade');
  assert.equal(upgrade.value, 600);
  // Período que acaba dentro de muchos meses = ya está en plan anual
  assert.deepEqual(keys({ ...sub, stripe_subscription_status: 'active', stripe_current_period_end: unix('2027-06-01') }), []);
});

test('quoted but unpaid clients get a proposal follow-up worth the full first year', () => {
  const [opp] = clientOpportunities({ ...base, amount_onetime: 900, amount_monthly: 30 }, {}, TODAY);
  assert.equal(opp.auto_key, 'close_proposal');
  assert.equal(opp.value, 1260);
  assert.deepEqual(keys({ ...base, amount_onetime: 900 }, { payments: [{ amount: 900 }] }), ['maintenance_plan']);
  assert.deepEqual(keys(base), []);
});

test('manual coverage triggers a renewal only around its end date', () => {
  const pay = end => ({ payments: [{ amount: 240, coverage_end: end, service_concept: 'Hosting' }] });
  const client = { ...base, amount_annual: 240 };
  assert.deepEqual(keys(client, pay('2026-11-10')), ['renewal:2026-11-10']);
  assert.deepEqual(keys(client, pay('2026-09-20')), ['renewal:2026-09-20']);
  assert.deepEqual(keys(client, pay('2027-10-01')), []);
  assert.deepEqual(keys(client, pay('2026-01-01')), []);
  assert.deepEqual(keys({ ...client, stripe_subscription_status: 'active' }, pay('2026-11-10')), []);
});

test('a delivered project with nothing else running suggests a next phase', () => {
  const delivered = { id: 'p1', name: 'Web', status: 'entregado', delivered_at: '2026-09-01' };
  assert.deepEqual(keys(base, { projects: [delivered] }), ['next_project:p1']);
  assert.deepEqual(keys(base, { projects: [delivered, { id: 'p2', status: 'en_progreso' }] }), []);
});
