import test from 'node:test';
import assert from 'node:assert/strict';
import {
  followupStatus, dueFollowups, funnel, bySource, sourceGroup,
  normalizeFollowupFields, suggestNextFollowup, followupsMessage, daysBetween,
} from '../lib/lead-rules.js';

const TODAY = '2026-11-12';

test('closed leads never ask for follow-up, even with a past date', () => {
  assert.equal(followupStatus({ stage: 'ganado', next_followup_at: '2026-10-01' }, TODAY).due, false);
  assert.equal(followupStatus({ stage: 'perdido', next_followup_at: '2026-10-01' }, TODAY).due, false);
});

test('a follow-up date makes the lead due from that day on', () => {
  assert.deepEqual(followupStatus({ stage: 'contactada', next_followup_at: TODAY }, TODAY),
    { due: true, overdueDays: 0, reason: 'hoy' });
  const late = followupStatus({ stage: 'contactada', next_followup_at: '2026-11-09' }, TODAY);
  assert.equal(late.due, true);
  assert.equal(late.overdueDays, 3);
  assert.equal(followupStatus({ stage: 'contactada', next_followup_at: '2026-11-13' }, TODAY).due, false);
});

test('hot leads without a date are due after 5 idle days, early stages never are', () => {
  const stale = { stage: 'propuesta', last_contact_at: '2026-11-05T10:00:00Z' };
  assert.equal(followupStatus(stale, TODAY).reason, 'sin_movimiento');
  assert.equal(followupStatus({ stage: 'propuesta', last_contact_at: '2026-11-09T10:00:00Z' }, TODAY).due, false);
  // sin último contacto se usa updated_at y después created_at
  assert.equal(followupStatus({ stage: 'reunion', updated_at: '2026-10-01T00:00:00Z' }, TODAY).due, true);
  assert.equal(followupStatus({ stage: 'contactada', last_contact_at: '2026-01-01T00:00:00Z' }, TODAY).due, false);
  assert.equal(followupStatus({ stage: 'nuevo', created_at: '2026-01-01T00:00:00Z' }, TODAY).due, false);
});

test('a future follow-up date silences the stale rule', () => {
  assert.equal(followupStatus({ stage: 'propuesta', last_contact_at: '2026-10-01T00:00:00Z', next_followup_at: '2026-11-20' }, TODAY).due, false);
});

test('dueFollowups sorts by urgency: hot stage and temperature before plain overdue', () => {
  const leads = [
    { id: 'a', stage: 'contactada', next_followup_at: '2026-11-01' },
    { id: 'b', stage: 'propuesta', last_contact_at: '2026-10-20T00:00:00Z', temperature: 'caliente', value_estimate: 900 },
    { id: 'c', stage: 'reunion', last_contact_at: '2026-10-20T00:00:00Z' },
    { id: 'd', stage: 'ganado' },
    { id: 'e', stage: 'nuevo' },
  ];
  assert.deepEqual(dueFollowups(leads, TODAY).map(l => l.id), ['b', 'c', 'a']);
});

test('funnel counts stages and the share that moves forward', () => {
  const leads = [
    ...Array(6).fill({ stage: 'nuevo' }), ...Array(2).fill({ stage: 'email_no_enviado' }),
    ...Array(8).fill({ stage: 'contactada' }), { stage: 'propuesta' }, { stage: 'reunion' }, { stage: 'ganado' }, { stage: 'perdido' },
  ];
  const f = funnel(leads);
  assert.equal(f.total, 20);
  assert.equal(f.contacted, 12);
  assert.equal(f.advanced, 3);
  assert.equal(f.advanced_of_contacted_pct, 25);
  assert.equal(f.won, 1);
  assert.equal(funnel([]).contacted_pct, 0);
});

test('sources are grouped by prefix and ranked by volume', () => {
  assert.equal(sourceGroup('n8n-cordoba'), 'n8n');
  assert.equal(sourceGroup('n8n:chile'), 'n8n');
  assert.equal(sourceGroup(''), 'manual');
  assert.equal(sourceGroup(null), 'manual');
  const rows = bySource([
    { source: 'n8n-a', stage: 'contactada' }, { source: 'n8n-b', stage: 'propuesta' }, { source: 'n8n-c', stage: 'nuevo' },
    { source: 'referido', stage: 'ganado' },
  ]);
  assert.deepEqual(rows.map(r => r.source), ['n8n', 'referido']);
  assert.deepEqual(rows[0], { source: 'n8n', total: 3, contacted: 2, advanced: 1, won: 0 });
  assert.equal(rows[1].won, 1);
});

test('follow-up fields are validated and empty values clear the column', () => {
  assert.deepEqual(normalizeFollowupFields({}), { fields: {} });
  assert.deepEqual(normalizeFollowupFields({ temperature: 'caliente', channel: 'whatsapp', next_followup_at: '2026-11-20' }).fields,
    { temperature: 'caliente', channel: 'whatsapp', next_followup_at: '2026-11-20' });
  assert.deepEqual(normalizeFollowupFields({ temperature: '', next_followup_at: null }).fields, { temperature: null, next_followup_at: null });
  assert.ok(normalizeFollowupFields({ temperature: 'hirviendo' }).error);
  assert.ok(normalizeFollowupFields({ channel: 'paloma' }).error);
  assert.ok(normalizeFollowupFields({ next_followup_at: '2026-02-31' }).error);
  assert.ok(normalizeFollowupFields({ next_followup_at: '12/11/2026' }).error);
});

test('suggested next follow-up is sooner for hot stages', () => {
  assert.equal(suggestNextFollowup('propuesta', TODAY), '2026-11-15');
  assert.equal(suggestNextFollowup('contactada', TODAY), '2026-11-19');
});

test('daysBetween handles dates and full timestamps', () => {
  assert.equal(daysBetween('2026-11-05T23:30:00Z', '2026-11-12'), 7);
  assert.equal(daysBetween('x', '2026-11-12'), null);
});

test('follow-up notification lists up to five and counts the rest', () => {
  assert.equal(followupsMessage([]), null);
  const one = followupsMessage([{ name: 'Acosta', company: 'Bodegas Acosta' }]);
  assert.equal(one.title, 'Toca contactar 1 lead');
  assert.match(one.body, /Acosta \(Bodegas Acosta\)/);
  const many = followupsMessage(Array.from({ length: 7 }, (_, i) => ({ name: `L${i}` })));
  assert.equal(many.title, 'Toca contactar 7 leads');
  assert.match(many.body, /… y 2 más/);
});
