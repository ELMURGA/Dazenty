// api/projects.js — CRUD de proyectos (entrega real de trabajo a un cliente)
// ==========================================================
// GET    /api/projects               → lista (filtros: ?client_id=, ?status=)
// POST   /api/projects                → crear proyecto
// PUT    /api/projects?id=xxx         → actualizar
// DELETE /api/projects?id=xxx         → eliminar
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

const STATUSES = ['planificacion', 'en_progreso', 'en_revision', 'entregado', 'pausado', 'cancelado'];

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, status, client_id } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('projects', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.client_id) return res.status(400).json({ error: 'client_id es obligatorio' });
      if (!body.name) return res.status(400).json({ error: 'El nombre del proyecto es obligatorio' });
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      const created = await sbInsert('projects', body);
      await logActivity('project', created.id, 'created', `Nuevo proyecto: ${created.name}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const body = { ...req.body };
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      if (body.status === 'entregado' && !body.delivered_at) {
        body.delivered_at = new Date().toISOString();
      }
      const updated = await sbUpdate('projects', id, body);
      if (body.status) {
        await logActivity('project', id, 'status_changed', `Proyecto "${updated.name}" → "${body.status}"`);
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('projects', id);
      await logActivity('project', id, 'deleted', 'Proyecto eliminado');
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/projects]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
