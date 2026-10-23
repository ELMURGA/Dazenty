// lib/push.js — Avisos push del panel (Web Push con claves VAPID)
// ==========================================================
// Lo usan /api/push (suscripción y ajustes desde el panel) y /api/push-cron
// (lo llama pg_cron cada 5 minutos). La parte de "qué aviso toca ahora" es pura
// para poder probarla sin red: ver dueNotifications().
// ==========================================================

import webPush from 'web-push';
import { SB_URL, sbHeaders, sbReadHeaders, sbSelect } from './db.js';

export const TZ = 'Europe/Madrid';

// Margen tras la hora programada en el que el aviso aún se envía. Si el programador
// estuvo caído más tiempo, el aviso de ese día se pierde en vez de llegar a deshora.
export const SEND_WINDOW_MIN = 120;

export const DEFAULT_SETTINGS = {
  tasks_enabled: true, tasks_time: '07:00',
  story_enabled: true, story_time: '14:30', story_days: [1, 2, 3, 4, 5],
  weekly_enabled: true, weekly_time: '18:00',
};

export const MESSAGES = {
  story: { title: 'Historias', body: '¡Es hora de subir la historia!!!!', url: '/admin#historias' },
  weekly: { title: 'Historias de la semana', body: '¡Hay que crear las historias de la semana!!!', url: '/admin#historias' },
};

// Fecha, día de la semana (0 = domingo) y minuto del día en hora de España
export function madridNow(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, dow, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(value) {
  if (!TIME_RE.test(String(value))) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

// Valida y normaliza los ajustes que llegan del panel. Devuelve { settings } o { error }.
export function normalizeSettings(input) {
  const s = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return { error: 'Ajustes inválidos' };
  for (const key of ['tasks_time', 'story_time', 'weekly_time']) {
    if (input[key] === undefined) continue;
    if (timeToMinutes(input[key]) === null) return { error: 'Las horas deben tener el formato HH:MM' };
    s[key] = input[key];
  }
  for (const key of ['tasks_enabled', 'story_enabled', 'weekly_enabled']) {
    if (input[key] !== undefined) s[key] = input[key] === true;
  }
  if (input.story_days !== undefined) {
    const days = input.story_days;
    if (!Array.isArray(days) || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { error: 'Días de historia inválidos' };
    }
    s.story_days = [...new Set(days)].sort();
  }
  return { settings: s };
}

// Qué avisos tocan ahora. `sent` = tipos ya enviados hoy; `storyDone` = la historia
// de hoy ya está marcada como subida.
export function dueNotifications(now, settings, { sent = [], storyDone = false } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const inWindow = time => {
    const t = timeToMinutes(time);
    return t !== null && now.minutes >= t && now.minutes < t + SEND_WINDOW_MIN;
  };
  const due = [];
  if (s.tasks_enabled && inWindow(s.tasks_time)) due.push('tasks');
  if (s.story_enabled && !storyDone && s.story_days.includes(now.dow) && inWindow(s.story_time)) due.push('story');
  if (s.weekly_enabled && now.dow === 0 && inWindow(s.weekly_time)) due.push('weekly');
  return due.filter(kind => !sent.includes(kind));
}

// Texto del aviso de las 7:00 con las tareas del día (y las atrasadas, si hay)
export function tasksMessage(tasks, today) {
  const open = tasks.filter(t => ['pendiente', 'en_progreso'].includes(t.status) && t.due_date);
  const todays = open.filter(t => t.due_date === today);
  const overdue = open.filter(t => t.due_date < today);
  if (!todays.length && !overdue.length) return null;
  const lines = todays.slice(0, 6).map(t => `• ${t.title}`);
  if (todays.length > 6) lines.push(`… y ${todays.length - 6} más`);
  if (overdue.length) lines.push(`⚠️ ${overdue.length} atrasada${overdue.length === 1 ? '' : 's'}`);
  return {
    title: todays.length ? `Tareas de hoy (${todays.length})` : 'Tienes tareas atrasadas',
    body: lines.join('\n'),
    url: '/admin#tasks',
  };
}

export async function getSetting(key, fallback) {
  const [row] = await sbSelect('app_settings', `key=eq.${encodeURIComponent(key)}&select=value`);
  return row ? row.value : fallback;
}

export async function putSetting(key, value) {
  const r = await fetch(`${SB_URL}/rest/v1/app_settings?on_conflict=key`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase app_settings ${r.status}`);
}

// Reserva el aviso (kind, fecha) antes de enviarlo. Devuelve false si otra ejecución
// ya lo había reservado: así dos llamadas seguidas nunca duplican el aviso.
export async function claimNotification(kind, date) {
  const r = await fetch(`${SB_URL}/rest/v1/push_log`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ kind, notif_date: date }),
  });
  if (!r.ok) throw new Error(`Supabase push_log ${r.status}`);
  return (await r.json()).length > 0;
}

export function vapidConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

// Envía el aviso a todos los dispositivos suscritos y borra los que ya no existen
export async function sendToAll(message) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:designerazenty@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const subs = await sbSelect('push_subscriptions', 'select=endpoint,p256dh,auth');
  let sent = 0, failed = 0;
  for (const sub of subs) {
    try {
      await webPush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(message),
        { TTL: 3600, urgency: 'high' },
      );
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
          method: 'DELETE', headers: sbReadHeaders,
        });
      } else {
        console.error('[push]', err.statusCode, err.body || err.message);
      }
    }
  }
  return { sent, failed, devices: subs.length };
}
