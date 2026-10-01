// api/leads.js — CRUD de leads (CRM pipeline de entrada)
// ==========================================================
// GET    /api/leads               → lista (filtros: ?stage=)
// POST   /api/leads                → crear lead
// PUT    /api/leads?id=xxx         → actualizar lead (incl. cambio de stage)
// DELETE /api/leads?id=xxx         → eliminar lead
// Todas requieren x-admin-password.
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

const STAGES = ['nuevo', 'contactada', 'propuesta', 'reunion', 'ganado', 'perdido'];

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, stage } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc';
      if (stage) params += `&stage=eq.${encodeURIComponent(stage)}`;
      return res.json(await sbSelect('leads', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.name) return res.status(400).json({ error: 'El nombre del lead es obligatorio' });
      if (body.stage && !STAGES.includes(body.stage)) {
        return res.status(400).json({ error: `stage inválido. Usa: ${STAGES.join(', ')}` });
      }
      const created = await sbInsert('leads', body);
      await logActivity('lead', created.id, 'created', `Nuevo lead: ${created.name}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const body = { ...req.body };
      if (body.stage && !STAGES.includes(body.stage)) {
        return res.status(400).json({ error: `stage inválido. Usa: ${STAGES.join(', ')}` });
      }
      const updated = await sbUpdate('leads', id, body);
      if (body.stage) {
        await logActivity('lead', id, 'stage_changed', `Lead "${updated.name}" movido a "${body.stage}"`);
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('leads', id);
      await logActivity('lead', id, 'deleted', 'Lead eliminado');
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/leads]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
