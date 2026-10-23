// api/push.js — Avisos push y apartado "Historias" del panel
// ==========================================================
// GET    /api/push                      → clave pública VAPID, ajustes, enlaces y días con historia subida
// POST   /api/push?action=subscribe      → guarda la suscripción de este dispositivo
// POST   /api/push?action=unsubscribe    → la borra ({ endpoint })
// POST   /api/push?action=test           → envía un aviso de prueba a todos los dispositivos
// PUT    /api/push?action=settings       → guarda horas y días de los avisos
// PUT    /api/push?action=links          → guarda los enlaces de historias [{ title, url }]
// PUT    /api/push?action=story          → marca/desmarca un día como "historia subida" ({ date, done })
// ==========================================================

import { guard, SB_URL, sbHeaders, sbReadHeaders, sbSelect } from '../lib/db.js';
import { DEFAULT_SETTINGS, normalizeSettings, getSetting, putSetting, sendToAll, vapidConfigured } from '../lib/push.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeLinks(input) {
  if (!Array.isArray(input) || input.length > 20) return null;
  const links = [];
  for (const item of input) {
    const title = String(item?.title || '').trim().slice(0, 80);
    let url;
    try { url = new URL(String(item?.url || '')); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    links.push({ title: title || url.hostname, url: url.href });
  }
  return links;
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const action = req.query.action || '';

  try {
    if (req.method === 'GET') {
      const from = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
      const [settings, links, storyDays, subs] = await Promise.all([
        getSetting('notifications', {}),
        getSetting('story_links', []),
        sbSelect('story_days', `story_date=gte.${from}&select=story_date`),
        sbSelect('push_subscriptions', 'select=endpoint'),
      ]);
      return res.json({
        publicKey: process.env.VAPID_PUBLIC_KEY || null,
        settings: { ...DEFAULT_SETTINGS, ...settings },
        links,
        storyDays: storyDays.map(d => d.story_date),
        endpoints: subs.map(s => s.endpoint),
      });
    }

    if (req.method === 'POST' && action === 'subscribe') {
      const sub = req.body?.subscription;
      const endpoint = String(sub?.endpoint || '');
      if (!endpoint.startsWith('https://') || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return res.status(400).json({ error: 'Suscripción inválida' });
      }
      const r = await fetch(`${SB_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
        method: 'POST',
        headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          endpoint, p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth),
          user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
        }),
      });
      if (!r.ok) throw new Error(`Supabase push_subscriptions ${r.status}`);
      return res.status(201).json({ ok: true });
    }

    if (req.method === 'POST' && action === 'unsubscribe') {
      const endpoint = String(req.body?.endpoint || '');
      if (!endpoint) return res.status(400).json({ error: 'endpoint requerido' });
      await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
        method: 'DELETE', headers: sbReadHeaders,
      });
      return res.status(204).end();
    }

    if (req.method === 'POST' && action === 'test') {
      if (!vapidConfigured()) return res.status(503).json({ error: 'Faltan las claves VAPID en Vercel' });
      const result = await sendToAll({ title: 'Dazenty OS', body: 'Las notificaciones funcionan ✅', url: '/admin#historias' });
      return res.json(result);
    }

    if (req.method === 'PUT' && action === 'settings') {
      const current = await getSetting('notifications', {});
      const { settings, error } = normalizeSettings({ ...current, ...req.body });
      if (error) return res.status(400).json({ error });
      await putSetting('notifications', settings);
      return res.json(settings);
    }

    if (req.method === 'PUT' && action === 'links') {
      const links = normalizeLinks(req.body?.links);
      if (!links) return res.status(400).json({ error: 'Enlaces inválidos: usa direcciones https://' });
      await putSetting('story_links', links);
      return res.json(links);
    }

    if (req.method === 'PUT' && action === 'story') {
      const date = String(req.body?.date || '');
      if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return res.status(400).json({ error: 'Fecha inválida' });
      const r = req.body?.done === true
        ? await fetch(`${SB_URL}/rest/v1/story_days?on_conflict=story_date`, {
            method: 'POST',
            headers: { ...sbHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify({ story_date: date }),
          })
        : await fetch(`${SB_URL}/rest/v1/story_days?story_date=eq.${date}`, { method: 'DELETE', headers: sbReadHeaders });
      if (!r.ok) throw new Error(`Supabase story_days ${r.status}`);
      return res.json({ date, done: req.body?.done === true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/push]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
