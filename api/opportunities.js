// api/opportunities.js — CRUD de oportunidades (negociaciones/propuestas en curso)
// ==========================================================
// GET    /api/opportunities              → lista (filtros: ?status=, ?client_id=)
// POST   /api/opportunities               → crear oportunidad
// PUT    /api/opportunities?id=xxx        → actualizar
// DELETE /api/opportunities?id=xxx        → eliminar
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

const STATUSES = ['abierta', 'en_progreso', 'ganada', 'perdida'];

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, status, client_id } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('opportunities', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.title) return res.status(400).json({ error: 'El título de la oportunidad es obligatorio' });
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      const created = await sbInsert('opportunities', body);
      await logActivity('opportunity', created.id, 'created', `Nueva oportunidad: ${created.title}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const body = { ...req.body };
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      const updated = await sbUpdate('opportunities', id, body);
      if (body.status) {
        await logActivity('opportunity', id, 'status_changed', `Oportunidad "${updated.title}" → "${body.status}"`);
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('opportunities', id);
      await logActivity('opportunity', id, 'deleted', 'Oportunidad eliminada');
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/opportunities]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
