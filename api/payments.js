// api/payments.js — CRUD de pagos (ingresos reales). Al crear/eliminar un pago,
// recalcula automáticamente paid_amount y status de la factura asociada.
// ==========================================================
// GET    /api/payments               → lista (filtros: ?client_id=, ?invoice_id=)
// POST   /api/payments                → crear pago
// DELETE /api/payments?id=xxx         → eliminar pago (revierte el efecto en la factura)
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';

const METHODS = ['stripe', 'transferencia', 'efectivo', 'bizum', 'otro'];

async function recalcInvoice(invoiceId) {
  if (!invoiceId) return;
  const [invoice] = await sbSelect('invoices', `id=eq.${encodeURIComponent(invoiceId)}&select=*`);
  if (!invoice) return;
  const payments = await sbSelect('payments', `invoice_id=eq.${encodeURIComponent(invoiceId)}&select=amount`);
  const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  let status = invoice.status;
  if (status !== 'cancelada') {
    if (paid <= 0) status = 'pendiente';
    else if (paid >= Number(invoice.total)) status = 'pagada';
    else status = 'parcial';
  }
  await sbUpdate('invoices', invoiceId, { paid_amount: Math.round(paid * 100) / 100, status });
}

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, client_id, invoice_id } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=payment_date.desc';
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      if (invoice_id) params += `&invoice_id=eq.${encodeURIComponent(invoice_id)}`;
      return res.json(await sbSelect('payments', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.client_id) return res.status(400).json({ error: 'client_id es obligatorio' });
      if (!body.amount || Number(body.amount) <= 0) return res.status(400).json({ error: 'amount debe ser mayor que 0' });
      if (body.payment_method && !METHODS.includes(body.payment_method)) {
        return res.status(400).json({ error: `payment_method inválido. Usa: ${METHODS.join(', ')}` });
      }
      const created = await sbInsert('payments', body);
      if (created.invoice_id) await recalcInvoice(created.invoice_id);
      await logActivity('payment', created.id, 'created', `Pago recibido de ${created.amount}€`);
      return res.status(201).json(created);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const [existing] = await sbSelect('payments', `id=eq.${encodeURIComponent(id)}&select=invoice_id`);
      await sbDelete('payments', id);
      if (existing?.invoice_id) await recalcInvoice(existing.invoice_id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/payments]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
