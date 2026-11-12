// api/activities.js — Feed de actividad (solo lectura)
// ==========================================================
// GET /api/activities               → últimas actividades (filtros: ?entity_type=, ?limit=)
// Las escrituras las hacen internamente otros endpoints vía lib/db.js#logActivity
// ==========================================================

import { guard, sbSelect } from '../lib/db.js';

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { entity_type, entity_id, limit } = req.query;

  try {
    if (req.method === 'GET') {
      const n = Math.min(parseInt(limit, 10) || 30, 200);
      let params = `select=*&order=created_at.desc&limit=${n}`;
      if (entity_type) params += `&entity_type=eq.${encodeURIComponent(entity_type)}`;
      if (entity_id) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entity_id))) {
          return res.status(400).json({ error: 'entity_id inválido' });
        }
        params += `&entity_id=eq.${entity_id}`;
      }
      return res.json(await sbSelect('activities', params));
    }
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/activities]', err);
    return res.status(500).json({ error: err.message || 'Error del servidor' });
  }
}
