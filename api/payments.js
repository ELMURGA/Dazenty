// api/payments.js — CRUD de pagos (ingresos reales). Al crear/eliminar un pago,
// recalcula automáticamente paid_amount y status de la factura asociada.
// ==========================================================
// GET    /api/payments               → lista (filtros: ?client_id=, ?invoice_id=)
// POST   /api/payments                → crear pago
// DELETE /api/payments?id=xxx         → eliminar pago (revierte el efecto en la factura)
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';
import { validatePayment } from '../lib/payment-validation.js';

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
  if (await guard(req, res)) return;
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
      const validationError = validatePayment(body);
      if (validationError) return res.status(400).json({ error: validationError });
      if (body.payment_method && !METHODS.includes(body.payment_method)) {
        return res.status(400).json({ error: `payment_method inválido. Usa: ${METHODS.join(', ')}` });
      }
      const force = body.force === true;
      delete body.force;
      body.amount = Number(body.amount);
      if (body.invoice_id) {
        const [invoice] = await sbSelect('invoices', `id=eq.${encodeURIComponent(body.invoice_id)}&select=client_id,total,paid_amount,status`);
        if (!invoice || invoice.client_id !== body.client_id) {
          return res.status(400).json({ error: 'La factura no pertenece al cliente seleccionado' });
        }
        if (invoice.status === 'cancelada') return res.status(409).json({ error: 'La factura está cancelada: no admite cobros' });
        const pending = Math.round((Number(invoice.total) - Number(invoice.paid_amount || 0)) * 100) / 100;
        if (pending <= 0) return res.status(409).json({ error: 'Esta factura ya está pagada entera: no hace falta registrar otro cobro' });
        if (body.amount > pending + 0.005) {
          return res.status(400).json({ error: `El cobro (${body.amount}€) supera lo que falta por pagar de la factura (${pending}€)` });
        }
      }
      // Cobros de una web por partes: no se puede cobrar más del precio total de esa web
      if (body.payment_kind === 'web') {
        const webTotal = Number(body.web_total);
        const prev = await sbSelect('payments',
          `client_id=eq.${encodeURIComponent(body.client_id)}&payment_kind=eq.web&web_total=eq.${webTotal}&select=amount`);
        const already = prev.reduce((sum, p) => sum + Number(p.amount), 0);
        if (already + body.amount > webTotal + 0.005) {
          const left = Math.max(0, Math.round((webTotal - already) * 100) / 100);
          return res.status(409).json({ error: `Esta web (${webTotal}€) ya lleva ${Math.round(already * 100) / 100}€ cobrados: solo quedan ${left}€ por cobrar` });
        }
      }
      // Mismo cliente, importe y fecha que otro cobro ya registrado: casi seguro un doble clic o un duplicado
      if (!force) {
        const date = body.payment_date || new Date().toISOString().slice(0, 10);
        const same = await sbSelect('payments',
          `client_id=eq.${encodeURIComponent(body.client_id)}&amount=eq.${body.amount}&payment_date=eq.${date}&select=id`);
        if (same.length) {
          return res.status(409).json({ code: 'duplicate', error: 'Ya hay un cobro igual (mismo cliente, importe y fecha). ¿Seguro que es otro distinto?' });
        }
      }
      if (body.payment_kind === 'web') body.web_total = Number(body.web_total);
      if (body.service_concept) body.service_concept = body.service_concept.trim();
      const created = await sbInsert('payments', body);
      if (created.invoice_id) await recalcInvoice(created.invoice_id);
      await logActivity('payment', created.id, 'created',
        `Pago recibido de ${created.amount}€${created.service_concept ? ` · ${created.service_concept}` : ''}`,
        { client_id: created.client_id, payment_method: created.payment_method,
          coverage_start: created.coverage_start, coverage_end: created.coverage_end });
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
