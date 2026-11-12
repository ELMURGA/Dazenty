// api/push-cron.js — Envía los avisos push programados del panel
// ==========================================================
// Lo llama pg_cron (Supabase) cada 5 minutos con "Authorization: Bearer CRON_SECRET"
// (ver supabase/migrations/012_push_cron.sql). Según la hora de España y los ajustes
// de app_settings.notifications envía:
//   - tasks  → a la hora de tareas (07:00), las tareas que vencen hoy
//   - story  → a la hora de historias, "¡Es hora de subir la historia!!!!" (salvo si ya está marcada)
//   - weekly → el domingo, "¡Hay que crear las historias de la semana!!!"
//   - followups → entre semana, los leads a los que toca contactar (ver lib/lead-rules.js)
//   - cobros → entre semana, los cobros pendientes vencidos o que vencen hoy (lib/receivable-rules.js)
// push_log impide repetir un aviso el mismo día aunque la llamada se repita.
// ==========================================================

import { SB_URL, SB_KEY, safeEqual, sbSelect } from '../lib/db.js';
import { dueFollowups, followupsMessage } from '../lib/lead-rules.js';
import { dueReceivables, receivablesMessage } from '../lib/receivable-rules.js';
import { proposalDueByLead } from '../lib/proposal-rules.js';
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
      if (kind === 'followups') {
        // Candidatos: leads abiertos que han respondido, con fecha de seguimiento vencida o en
        // fase caliente; más los de propuestas enviadas/vistas sin movimiento
        const select = 'select=id,name,company,stage,temperature,value_estimate,next_followup_at,last_contact_at,updated_at,created_at,awaiting_reply,replied_at';
        const leads = await sbSelect('leads',
          `stage=not.in.(ganado,perdido)&or=(awaiting_reply.eq.true,next_followup_at.lte.${now.date},stage.in.(propuesta,reunion))&${select}&limit=1000`);
        const proposals = await sbSelect('proposals',
          'status=in.(enviada,vista)&select=id,lead_id,title,status,sent_at,next_followup_at,updated_at,created_at&limit=1000').catch(() => []);
        const proposalDue = proposalDueByLead(proposals, now.date);
        const known = new Set(leads.map(l => l.id));
        const extraIds = [...proposalDue.keys()].filter(id => !known.has(id)).slice(0, 100);
        if (extraIds.length) {
          leads.push(...await sbSelect('leads',
            `id=in.(${extraIds.join(',')})&stage=not.in.(ganado,perdido)&${select}`));
        }
        message = followupsMessage(dueFollowups(leads, now.date, { proposalDue }));
        if (!message) { results[kind] = 'sin seguimientos'; continue; }
      }
      if (kind === 'cobros') {
        const rows = await sbSelect('receivables',
          `status=eq.pendiente&due_date=lte.${now.date}&select=id,client_id,concept,amount,due_date,status&order=due_date.asc&limit=200`);
        const clients = rows.length ? await sbSelect('clients', 'select=id,client_name') : [];
        const names = Object.fromEntries(clients.map(c => [c.id, c.client_name]));
        message = receivablesMessage(dueReceivables(rows, now.date), r => names[r.client_id] || '');
        if (!message) { results[kind] = 'sin cobros vencidos'; continue; }
      }
      results[kind] = await sendToAll(message);
    }
    return res.json({ now, due, results });
  } catch (err) {
    console.error('[api/push-cron]', err);
    return res.status(500).json({ error: 'Error al enviar los avisos' });
  }
}
