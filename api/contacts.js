// api/contacts.js — CRUD de contactos por cliente
// ==========================================================
// GET    /api/contacts?client_id=xxx    → lista de contactos de un cliente
// POST   /api/contacts                   → crear contacto
// PUT    /api/contacts?id=xxx            → actualizar
// DELETE /api/contacts?id=xxx            → eliminar
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete } from '../lib/db.js';

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, client_id } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=is_primary.desc,created_at.asc';
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('contacts', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.client_id) return res.status(400).json({ error: 'client_id es obligatorio' });
      if (!body.name) return res.status(400).json({ error: 'El nombre del contacto es obligatorio' });
      const created = await sbInsert('contacts', body);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const updated = await sbUpdate('contacts', id, req.body);
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('contacts', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/contacts]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
