// api/tasks.js — CRUD de tareas (ligadas opcionalmente a proyecto/cliente/lead)
// ==========================================================
// GET    /api/tasks               → lista (filtros: ?project_id=, ?status=, ?due=today)
// POST   /api/tasks                → crear tarea
// PUT    /api/tasks?id=xxx         → actualizar
// DELETE /api/tasks?id=xxx         → eliminar
//
// Con la cabecera x-isla-token (app Isla del Mac) en vez de la contraseña: solo ver las
// pendientes y las terminadas en las últimas 48 h, crear (título y fecha) y marcar o
// desmarcar como hecha. No puede borrar ni tocar nada más.
// ==========================================================

import { guard, guardIsla, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

const STATUSES = ['pendiente', 'en_progreso', 'completada', 'cancelada'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

const ISLA_FIELDS = ['id', 'title', 'status', 'priority', 'due_date', 'completed_at'];
const forIsla = row => Object.fromEntries(ISLA_FIELDS.map(f => [f, row[f] ?? null]));

// Peticiones de la app Isla: se atienden aparte para que ningún campo ni filtro de más se cuele
async function isla(req, res) {
  const { id } = req.query;
  const body = req.body || {};

  if (req.method === 'GET') {
    const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const rows = await sbSelect('tasks', `select=${ISLA_FIELDS.join(',')}`
      + `&or=(status.in.(pendiente,en_progreso),completed_at.gte.${encodeURIComponent(since)})`
      + '&order=due_date.asc.nullslast');
    return res.json(rows.map(forIsla));
  }

  if (req.method === 'POST') {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length > 300) return res.status(400).json({ error: 'Título obligatorio (máximo 300 caracteres)' });
    const due = body.due_date ?? null;
    if (due !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(due))) {
      return res.status(400).json({ error: 'due_date debe tener el formato AAAA-MM-DD' });
    }
    const created = await sbInsert('tasks', { title, due_date: due, status: 'pendiente', priority: 'media' });
    await logActivity('task', created.id, 'created', `Nueva tarea: ${created.title}`);
    return res.status(201).json(forIsla(created));
  }

  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
    if (!['pendiente', 'completada'].includes(body.status)) {
      return res.status(400).json({ error: 'status inválido. Usa: pendiente, completada' });
    }
    const done = body.status === 'completada';
    const updated = await sbUpdate('tasks', id, { status: body.status, completed_at: done ? new Date().toISOString() : null });
    if (!updated) return res.status(404).json({ error: 'Tarea no encontrada' });
    if (done) await logActivity('task', id, 'completed', `Tarea completada: ${updated.title}`);
    return res.json(forIsla(updated));
  }

  return res.status(403).json({ error: 'Esta clave no permite esa operación' });
}

export default async function handler(req, res) {
  const scoped = req.headers['x-isla-token'] !== undefined;
  if (scoped ? await guardIsla(req, res) : await guard(req, res)) return;
  const { id, status, project_id, client_id, due } = req.query;

  try {
    if (scoped) return await isla(req, res);

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
