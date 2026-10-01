// api/tasks.js — CRUD de tareas (ligadas opcionalmente a proyecto/cliente/lead)
// ==========================================================
// GET    /api/tasks               → lista (filtros: ?project_id=, ?status=, ?due=today)
// POST   /api/tasks                → crear tarea
// PUT    /api/tasks?id=xxx         → actualizar
// DELETE /api/tasks?id=xxx         → eliminar
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

const STATUSES = ['pendiente', 'en_progreso', 'completada', 'cancelada'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, status, project_id, client_id, due } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=due_date.asc.nullslast';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (project_id) params += `&project_id=eq.${encodeURIComponent(project_id)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      if (due === 'today') {
        const today = new Date().toISOString().slice(0, 10);
        params += `&due_date=lte.${today}&status=neq.completada`;
      }
      return res.json(await sbSelect('tasks', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.title) return res.status(400).json({ error: 'El título de la tarea es obligatorio' });
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      if (body.priority && !PRIORITIES.includes(body.priority)) {
        return res.status(400).json({ error: `priority inválida. Usa: ${PRIORITIES.join(', ')}` });
      }
      const created = await sbInsert('tasks', body);
      await logActivity('task', created.id, 'created', `Nueva tarea: ${created.title}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const body = { ...req.body };
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      if (body.status === 'completada' && !body.completed_at) {
        body.completed_at = new Date().toISOString();
      }
      const updated = await sbUpdate('tasks', id, body);
      if (body.status === 'completada') {
        await logActivity('task', id, 'completed', `Tarea completada: ${updated.title}`);
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('tasks', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/tasks]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
