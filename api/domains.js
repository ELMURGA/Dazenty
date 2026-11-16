// api/domains.js — Dominios comprados y control de caducidades
// ==========================================================
// GET    /api/domains                      → lista ordenada por caducidad (primero los que antes caducan)
// POST   /api/domains                      → crear { domain, expires_at, client_id?, registrar?, registered_at?, renewal_price?, notify_client?, notes? }
// PUT    /api/domains?id=xxx               → editar (si cambia expires_at, se reinician los avisos: ya está renovado)
// DELETE /api/domains?id=xxx               → eliminar
// POST   /api/domains?id=xxx&action=notify → enviar ahora el aviso de caducidad por email al cliente
// Todas requieren x-admin-password. Los avisos automáticos (móvil de Alejandro y email al cliente) los
// envía /api/push-cron.
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';
import { madridNow } from '../lib/push.js';
import { normalizeDomain } from '../lib/domain-rules.js';
import { emailClientAboutDomain } from '../lib/domain-notify.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { id, action } = req.query;

  try {
    if (req.method === 'GET') {
      return res.json(await sbSelect('domains', 'select=*&order=expires_at.asc&limit=1000'));
    }

    if (req.method === 'POST' && action === 'notify') {
      if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'id inválido' });
      const [domain] = await sbSelect('domains', `id=eq.${id}&select=*&limit=1`);
      if (!domain) return res.status(404).json({ error: 'Dominio no encontrado' });
      const r = await emailClientAboutDomain(domain, madridNow().date);
      if (!r.sent) return res.status(422).json({ error: `No se pudo avisar al cliente: ${r.reason}` });
      return res.json({ ok: true });
    }

    if (req.method === 'POST') {
      const n = normalizeDomain(req.body);
      if (n.error) return res.status(400).json({ error: n.error });
      try {
        const created = await sbInsert('domains', { notify_client: true, ...n.fields });
        await logActivity('domain', created.id, 'created', `Dominio añadido: ${created.domain}`);
        return res.status(201).json(created);
      } catch (err) {
        if (err.body?.code === '23505') return res.status(409).json({ error: 'Ese dominio ya está en la lista' });
        throw err;
      }
    }

    if (req.method === 'PUT') {
      if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'id inválido' });
      const n = normalizeDomain(req.body, { partial: true });
      if (n.error) return res.status(400).json({ error: n.error });
      const patch = { ...n.fields };
      if (patch.expires_at) {
        const [current] = await sbSelect('domains', `id=eq.${id}&select=expires_at&limit=1`);
        // Nueva caducidad = renovado: los avisos vuelven a empezar para el nuevo ciclo
        if (current && current.expires_at !== patch.expires_at) { patch.alert_stage = null; patch.client_notified_at = null; patch.owner_notified_at = null; }
      }
      try {
        return res.json(await sbUpdate('domains', id, patch));
      } catch (err) {
        if (err.body?.code === '23505') return res.status(409).json({ error: 'Ese dominio ya está en la lista' });
        throw err;
      }
    }

    if (req.method === 'DELETE') {
      if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'id inválido' });
      await sbDelete('domains', id);
      await logActivity('domain', id, 'deleted', 'Dominio eliminado');
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/domains]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
