// api/events.js — CRUD de eventos de calendario
// ==========================================================
// GET    /api/events                 → lista (filtros: ?from=, ?to=, ?client_id=)
// POST   /api/events                  → crear evento
// PUT    /api/events?id=xxx           → actualizar
// DELETE /api/events?id=xxx           → eliminar
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, from, to, client_id } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=start_at.asc';
      if (from) params += `&start_at=gte.${encodeURIComponent(from)}`;
      if (to) params += `&start_at=lte.${encodeURIComponent(to)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('events', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.title) return res.status(400).json({ error: 'El título del evento es obligatorio' });
      if (!body.start_at) return res.status(400).json({ error: 'start_at es obligatorio' });
      const created = await sbInsert('events', body);
      await logActivity('event', created.id, 'created', `Nuevo evento: ${created.title}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const updated = await sbUpdate('events', id, req.body);
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('events', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/events]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
