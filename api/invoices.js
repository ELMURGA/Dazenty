// api/invoices.js — CRUD de facturas + líneas (invoice_items)
// ==========================================================
// GET    /api/invoices                → lista (filtros: ?client_id=, ?status=), incluye items
// GET    /api/invoices?id=xxx          → una factura con sus items
// POST   /api/invoices                 → crear factura con items: [{description, quantity, unit_price}]
// PUT    /api/invoices?id=xxx          → actualizar factura (y reemplazar items si se envían)
// DELETE /api/invoices?id=xxx          → eliminar factura (cascada a items)
// ==========================================================

import { guard, SB_URL, sbHeaders, sbReadHeaders, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

const STATUSES = ['pendiente', 'pagada', 'parcial', 'vencida', 'cancelada'];

function computeTotals(items, taxRate) {
  const subtotal = items.reduce((sum, it) => sum + (Number(it.quantity) || 1) * (Number(it.unit_price) || 0), 0);
  const tax_amount = Math.round(subtotal * (Number(taxRate) || 0) / 100 * 100) / 100;
  const total = Math.round((subtotal + tax_amount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, tax_amount, total };
}

async function replaceItems(invoiceId, items) {
  // Borra los items anteriores y crea los nuevos (más simple y seguro que un diff)
  await fetch(`${SB_URL}/rest/v1/invoice_items?invoice_id=eq.${encodeURIComponent(invoiceId)}`, {
    method: 'DELETE',
    headers: sbReadHeaders,
  });
  if (!items.length) return [];
  const rows = items.map((it, idx) => ({
    invoice_id: invoiceId,
    description: it.description,
    quantity: Number(it.quantity) || 1,
    unit_price: Number(it.unit_price) || 0,
    total: Math.round((Number(it.quantity) || 1) * (Number(it.unit_price) || 0) * 100) / 100,
    sort_order: idx,
  }));
  const r = await fetch(`${SB_URL}/rest/v1/invoice_items`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(rows),
  });
  return r.json();
}

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, status, client_id } = req.query;

  try {
    if (req.method === 'GET' && id) {
      const invoices = await sbSelect('invoices', `id=eq.${encodeURIComponent(id)}&select=*`);
      if (!invoices.length) return res.status(404).json({ error: 'Factura no encontrada' });
      const items = await sbSelect('invoice_items', `invoice_id=eq.${encodeURIComponent(id)}&select=*&order=sort_order.asc`);
      return res.json({ ...invoices[0], items });
    }

    if (req.method === 'GET') {
      let params = 'select=*&order=issue_date.desc';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('invoices', params));
    }

    if (req.method === 'POST') {
      const { items = [], ...body } = req.body || {};
      if (!body.client_id) return res.status(400).json({ error: 'client_id es obligatorio' });
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      const totals = computeTotals(items, body.tax_rate ?? 21);
      const created = await sbInsert('invoices', { ...body, ...totals });
      const createdItems = await replaceItems(created.id, items);
      await logActivity('invoice', created.id, 'created', `Nueva factura ${created.invoice_number || created.id} por ${totals.total}€`);
      return res.status(201).json({ ...created, items: createdItems });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const { items, ...body } = req.body || {};
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      if (Array.isArray(items)) {
        Object.assign(body, computeTotals(items, body.tax_rate ?? 21));
      }
      const updated = await sbUpdate('invoices', id, body);
      let outItems;
      if (Array.isArray(items)) {
        outItems = await replaceItems(id, items);
      }
      if (body.status) {
        await logActivity('invoice', id, 'status_changed', `Factura ${updated.invoice_number || id} → "${body.status}"`);
      }
      return res.json(outItems ? { ...updated, items: outItems } : updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('invoices', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/invoices]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
