import test from 'node:test';
import assert from 'node:assert/strict';
import { madridNow, dueNotifications, normalizeSettings, tasksMessage, DEFAULT_SETTINGS } from '../lib/push.js';

const at = (dow, hhmm, date = '2026-10-26') => {
  const [h, m] = hhmm.split(':').map(Number);
  return { date, dow, minutes: h * 60 + m };
};

test('madridNow converts to Spanish time, including the October DST change', () => {
  assert.deepEqual(madridNow(new Date('2026-10-23T05:00:00Z')), { date: '2026-10-23', dow: 5, minutes: 7 * 60 });
  assert.deepEqual(madridNow(new Date('2026-10-26T06:00:00Z')), { date: '2026-10-26', dow: 1, minutes: 7 * 60 });
  assert.deepEqual(madridNow(new Date('2026-10-25T23:30:00Z')), { date: '2026-10-26', dow: 1, minutes: 30 });
});

test('sends each reminder from its time until the window closes, once per day', () => {
  const s = DEFAULT_SETTINGS;
  assert.deepEqual(dueNotifications(at(1, '06:55'), s), []);
  assert.deepEqual(dueNotifications(at(1, '07:00'), s), ['tasks']);
  assert.deepEqual(dueNotifications(at(1, '07:05'), s, { sent: ['tasks'] }), []);
  assert.deepEqual(dueNotifications(at(1, '09:05'), s), []);
  assert.deepEqual(dueNotifications(at(1, '14:30'), s), ['story']);
  assert.deepEqual(dueNotifications(at(1, '14:35'), s, { storyDone: true }), []);
});

test('story reminder only on chosen days; weekly reminder only on Sunday', () => {
  const s = DEFAULT_SETTINGS;
  assert.deepEqual(dueNotifications(at(6, '14:30'), s), []);
  assert.deepEqual(dueNotifications(at(0, '18:00'), s), ['weekly']);
  assert.deepEqual(dueNotifications(at(5, '18:00'), s), []);
  assert.deepEqual(dueNotifications(at(0, '14:30'), { ...s, story_days: [0] }), ['story']);
  assert.deepEqual(dueNotifications(at(1, '07:00'), { ...s, tasks_enabled: false }), []);
});

test('validates settings from the panel', () => {
  assert.equal(normalizeSettings({ story_time: '25:00' }).error !== undefined, true);
  assert.equal(normalizeSettings({ story_days: [1, 9] }).error !== undefined, true);
  assert.deepEqual(normalizeSettings({ story_time: '13:15', story_days: [5, 1, 1] }).settings.story_days, [1, 5]);
  assert.equal(normalizeSettings({ weekly_enabled: 'yes' }).settings.weekly_enabled, false);
});

test('tasks message lists today and counts overdue; nothing when empty', () => {
  const tasks = [
    { title: 'Llamar a Jocars', status: 'pendiente', due_date: '2026-10-26' },
    { title: 'Ya hecha', status: 'completada', due_date: '2026-10-26' },
    { title: 'Antigua', status: 'en_progreso', due_date: '2026-10-20' },
    { title: 'Mañana', status: 'pendiente', due_date: '2026-10-27' },
  ];
  const msg = tasksMessage(tasks, '2026-10-26');
  assert.equal(msg.title, 'Tareas de hoy (1)');
  assert.equal(msg.body, '• Llamar a Jocars\n⚠️ 1 atrasada');
  assert.equal(tasksMessage(tasks.slice(1, 2), '2026-10-26'), null);
});

test('lead follow-up reminder fires on weekdays at 10:00 and not on weekends', () => {
  const s = { ...DEFAULT_SETTINGS, cobros_enabled: false }; // los cobros se prueban aparte
  assert.deepEqual(dueNotifications(at(1, '10:00'), s), ['followups']);
  assert.deepEqual(dueNotifications(at(5, '11:30'), s), ['followups']);
  assert.deepEqual(dueNotifications(at(1, '10:05'), s, { sent: ['followups'] }), []);
  assert.deepEqual(dueNotifications(at(1, '12:00'), s), []);
  assert.deepEqual(dueNotifications(at(6, '10:00'), s), []);
  assert.deepEqual(dueNotifications(at(0, '10:00'), s), []);
  assert.deepEqual(dueNotifications(at(1, '10:00'), { ...s, followups_enabled: false }), []);
});

test('receivables reminder fires on weekdays at 10:00, once a day, and can be disabled', () => {
  const s = { ...DEFAULT_SETTINGS, followups_enabled: false };
  assert.deepEqual(dueNotifications(at(1, '10:00'), s), ['cobros']);
  assert.deepEqual(dueNotifications(at(5, '11:55'), s), ['cobros']);
  assert.deepEqual(dueNotifications(at(1, '10:05'), s, { sent: ['cobros'] }), []);
  assert.deepEqual(dueNotifications(at(6, '10:00'), s), []);
  assert.deepEqual(dueNotifications(at(0, '10:00'), s), []);
  assert.deepEqual(dueNotifications(at(1, '10:00'), { ...s, cobros_enabled: false }), []);
  assert.deepEqual(dueNotifications(at(1, '10:00'), DEFAULT_SETTINGS).sort(), ['cobros', 'followups']);
});

test('receivables settings are validated like the other reminders', () => {
  assert.equal(normalizeSettings({ cobros_time: '99:00' }).error !== undefined, true);
  assert.equal(normalizeSettings({ cobros_time: '09:30' }).settings.cobros_time, '09:30');
  assert.equal(normalizeSettings({ cobros_enabled: false }).settings.cobros_enabled, false);
});

test('follow-up settings are validated like the other reminders', () => {
  assert.equal(normalizeSettings({ followups_time: '25:00' }).error !== undefined, true);
  assert.equal(normalizeSettings({ followups_time: '09:30' }).settings.followups_time, '09:30');
  assert.equal(normalizeSettings({ followups_enabled: false }).settings.followups_enabled, false);
});
