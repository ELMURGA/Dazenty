// api/push-cron.js — Envía los avisos push programados del panel
// ==========================================================
// Lo llama pg_cron (Supabase) cada 5 minutos con "Authorization: Bearer CRON_SECRET"
// (ver supabase/migrations/012_push_cron.sql). Según la hora de España y los ajustes
// de app_settings.notifications envía:
//   - tasks  → a la hora de tareas (07:00), las tareas que vencen hoy
//   - story  → a la hora de historias, "¡Es hora de subir la historia!!!!" (salvo si ya está marcada)
//   - weekly → el domingo, "¡Hay que crear las historias de la semana!!!"
// push_log impide repetir un aviso el mismo día aunque la llamada se repita.
// ==========================================================

import { SB_URL, SB_KEY, safeEqual, sbSelect } from '../lib/db.js';
import {
  DEFAULT_SETTINGS, MESSAGES, madridNow, dueNotifications, tasksMessage,
  getSetting, claimNotification, sendToAll, vapidConfigured,
} from '../lib/push.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET no configurado' });
  const auth = String(req.headers.authorization || '');
  if (!safeEqual(auth, `Bearer ${secret}`)) return res.status(401).json({ error: 'No autorizado' });
  if (!SB_URL || !SB_KEY || !vapidConfigured()) return res.status(503).json({ error: 'Faltan variables de entorno' });

  try {
    const now = madridNow();
    const settings = { ...DEFAULT_SETTINGS, ...(await getSetting('notifications', {})) };
    const [logRows, storyRows] = await Promise.all([
      sbSelect('push_log', `notif_date=eq.${now.date}&select=kind`),
      sbSelect('story_days', `story_date=eq.${now.date}&select=story_date`),
    ]);
    const due = dueNotifications(now, settings, {
      sent: logRows.map(r => r.kind),
      storyDone: storyRows.length > 0,
    });

    const results = {};
    for (const kind of due) {
      if (!(await claimNotification(kind, now.date))) continue;
      let message = MESSAGES[kind];
      if (kind === 'tasks') {
        const tasks = await sbSelect('tasks',
          `due_date=lte.${now.date}&status=in.(pendiente,en_progreso)&select=title,status,due_date&order=due_date.asc`);
        message = tasksMessage(tasks, now.date);
        if (!message) { results[kind] = 'sin tareas'; continue; }
      }
      results[kind] = await sendToAll(message);
    }
    return res.json({ now, due, results });
  } catch (err) {
    console.error('[api/push-cron]', err);
    return res.status(500).json({ error: 'Error al enviar los avisos' });
  }
}
