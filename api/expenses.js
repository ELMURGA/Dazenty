// api/expenses.js — CRUD de gastos + categorías de gasto
// ==========================================================
// GET    /api/expenses                     → lista de gastos (filtros: ?category_id=)
// GET    /api/expenses?type=categories      → lista de categorías
// POST   /api/expenses                      → crear gasto
// POST   /api/expenses?type=categories      → crear categoría {name, color}
// PUT    /api/expenses?id=xxx                → actualizar gasto
// DELETE /api/expenses?id=xxx                → eliminar gasto
// DELETE /api/expenses?id=xxx&type=categories → eliminar categoría
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete } from '../lib/db.js';

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, type, category_id } = req.query;
  const isCategory = type === 'categories';
  const table = isCategory ? 'expense_categories' : 'expenses';

  try {
    if (req.method === 'GET') {
      let params = isCategory ? 'select=*&order=name.asc' : 'select=*&order=expense_date.desc';
      if (!isCategory && category_id) params += `&category_id=eq.${encodeURIComponent(category_id)}`;
      return res.json(await sbSelect(table, params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (isCategory) {
        if (!body.name) return res.status(400).json({ error: 'El nombre de la categoría es obligatorio' });
      } else {
        if (!body.description) return res.status(400).json({ error: 'La descripción del gasto es obligatoria' });
        if (!body.amount || Number(body.amount) <= 0) return res.status(400).json({ error: 'amount debe ser mayor que 0' });
      }
      const created = await sbInsert(table, body);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const updated = await sbUpdate(table, id, req.body);
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete(table, id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/expenses]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
