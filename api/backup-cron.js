// api/backup-cron.js — Copia de seguridad diaria de las tablas del panel
// ==========================================================
// GET/POST /api/backup-cron  con "Authorization: Bearer CRON_SECRET" → hace la copia
//   (la llama el cron de Vercel de vercel.json cada madrugada; Vercel envía el
//   CRON_SECRET solo, igual que pg_cron en push-cron.js).
// POST /api/backup-cron      con x-admin-password → "Hacer copia ahora" del panel
// GET  /api/backup-cron      con x-admin-password → { last } fecha de la última copia
// Las copias van al bucket privado "backups" de Supabase Storage (últimas 30).
// ==========================================================

import { SB_URL, SB_KEY, safeEqual, adminAuthError, applyCors } from '../lib/db.js';
import { getSetting, putSetting } from '../lib/push.js';
import { runBackup } from '../lib/backup.js';

const SETTING_KEY = 'last_backup';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  applyCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!SB_URL || !SB_KEY) return res.status(503).json({ error: 'Faltan variables de entorno' });

  const secret = process.env.CRON_SECRET;
  const fromCron = Boolean(secret) && safeEqual(String(req.headers.authorization || ''), `Bearer ${secret}`);
  if (!fromCron) {
    const authError = await adminAuthError(req);
    if (authError) return res.status(authError.status).json({ error: authError.error });
  }

  try {
    if (req.method === 'GET' && !fromCron) {
      return res.json({ last: await getSetting(SETTING_KEY, null) });
    }
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const result = await runBackup();
    const last = {
      at: result.at, file: result.file, counts: result.counts, errors: result.errors,
      deleted: result.deleted, size: result.size, source: fromCron ? 'automatica' : 'manual',
    };
    await putSetting(SETTING_KEY, last);
    return res.json({ ok: true, last });
  } catch (err) {
    // Sin detalle de filas: solo el motivo general
    console.error('[api/backup-cron]', String(err.message || '').slice(0, 120));
    return res.status(500).json({ error: 'No se pudo hacer la copia de seguridad' });
  }
}
