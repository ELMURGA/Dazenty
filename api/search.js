// api/search.js — Búsqueda global del panel
// ==========================================================
// GET /api/search?q=texto → { q, leads, clients, tasks, opportunities }
// q: mínimo 2 caracteres. Máximo 8 resultados por tipo. Se busca en la base de datos
// (no en lo que el navegador tenga cargado), así que funciona igual con miles de leads.
// Los comodines (% _ *) del texto se tratan como letras normales (lib/search.js).
// ==========================================================

import { guard, sbSelect } from '../lib/db.js';
import { buildOrFilter, sanitizeSearch, SEARCH_MIN, SEARCH_LIMIT } from '../lib/search.js';

const SELECTS = {
  leads: 'id,name,company,email,phone,whatsapp,city,stage',
  clients: 'id,client_name,company_name,client_contact_name,client_contact_email,slug,status',
  tasks: 'id,title,status,priority,due_date',
  opportunities: 'id,title,status,value,client_id',
};
const ORDERS = { leads: 'updated_at.desc', clients: 'client_name.asc', tasks: 'created_at.desc', opportunities: 'created_at.desc' };

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const raw = String(req.query.q ?? '');
  if (sanitizeSearch(raw).length < SEARCH_MIN) {
    return res.status(400).json({ error: `Escribe al menos ${SEARCH_MIN} caracteres` });
  }

  const out = { q: raw.trim(), leads: [], clients: [], tasks: [], opportunities: [] };
  // Cada tipo va por separado: si uno falla (p. ej. una tabla aún sin migrar) los demás se devuelven
  await Promise.all(Object.keys(SELECTS).map(async table => {
    try {
      const filter = encodeURIComponent(buildOrFilter(table, raw));
      out[table] = await sbSelect(table,
        `select=${SELECTS[table]}&or=${filter}&order=${ORDERS[table]}&limit=${SEARCH_LIMIT}`);
    } catch (err) {
      console.error('[api/search]', table, String(err.message || '').slice(0, 100));
    }
  }));
  return res.json(out);
}
