// api/message-templates.js — Plantillas de mensaje (WhatsApp / email)
// ==========================================================
// GET    /api/message-templates              → lista (?active=1 solo las activas)
// POST   /api/message-templates              → crear { name, category?, body, active? }
// PUT    /api/message-templates?id=xxx       → editar
// DELETE /api/message-templates?id=xxx       → eliminar
// Variables que admite el texto: {nombre} {empresa} {importe} {enlace} (se rellenan en el panel).
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete } from '../lib/db.js';
import { normalizeTemplate } from '../lib/message-templates.js';

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { id, active } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=name.asc&limit=200';
      if (active) params += '&active=eq.true';
      return res.json(await sbSelect('message_templates', params));
    }

    if (req.method === 'POST') {
      const n = normalizeTemplate(req.body);
      if (n.error) return res.status(400).json({ error: n.error });
      try {
        return res.status(201).json(await sbInsert('message_templates', { category: 'general', active: true, ...n.fields }));
      } catch (err) {
        if (err.body?.code === '23505') return res.status(409).json({ error: 'Ya hay una plantilla con ese nombre' });
        throw err;
      }
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const n = normalizeTemplate(req.body, { partial: true });
      if (n.error) return res.status(400).json({ error: n.error });
      try {
        return res.json(await sbUpdate('message_templates', id, n.fields));
      } catch (err) {
        if (err.body?.code === '23505') return res.status(409).json({ error: 'Ya hay una plantilla con ese nombre' });
        throw err;
      }
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('message_templates', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/message-templates]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
