// api/receivables.js — Cobros pendientes (lo que un cliente debe y aún no ha pagado)
// ==========================================================
// GET    /api/receivables                        → lista (filtros: ?status=, ?client_id=)
// POST   /api/receivables                        → crear { client_id, concept, amount, due_date, notes?, installment?, web_total? }
// PUT    /api/receivables?id=xxx                 → editar (o cancelar con status "cancelado"; reabrir con "pendiente")
// POST   /api/receivables?id=xxx&action=cobrado  → marcar como cobrado: crea el pago en payments
//                                                   y enlaza payment_id { payment_method?, payment_date? }
// DELETE /api/receivables?id=xxx                 → eliminar (un cobro ya cobrado no se borra: tiene su pago enlazado)
// Todas requieren x-admin-password.
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity, SB_URL, sbHeaders } from '../lib/db.js';
import { validatePayment } from '../lib/payment-validation.js';
import { normalizeReceivable } from '../lib/receivable-rules.js';
import { madridNow } from '../lib/push.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = ['stripe', 'transferencia', 'efectivo', 'bizum', 'otro'];
const httpError = (status, message) => Object.assign(new Error(message), { status });

async function loadReceivable(id) {
  if (!UUID_RE.test(String(id))) throw httpError(400, 'id inválido');
  const [row] = await sbSelect('receivables', `id=eq.${id}&select=*`);
  if (!row) throw httpError(404, 'Cobro no encontrado');
  return row;
}

// Marca el cobro como cobrado y crea el pago. El cambio de estado se hace primero y solo si
// sigue "pendiente" (condicional), así dos clics seguidos no crean dos pagos.
async function markPaid(id, body) {
  const r = await loadReceivable(id);
  if (r.status !== 'pendiente') throw httpError(409, r.status === 'cobrado' ? 'Este cobro ya está cobrado' : 'Este cobro está cancelado');
  if (!r.client_id) throw httpError(400, 'El cobro no tiene cliente: asígnale uno antes de marcarlo como cobrado');

  const method = body.payment_method || 'otro';
  if (!METHODS.includes(method)) throw httpError(400, `payment_method inválido. Usa: ${METHODS.join(', ')}`);
  const payment = {
    client_id: r.client_id,
    amount: Number(r.amount),
    payment_date: body.payment_date || madridNow().date,
    payment_method: method,
    service_concept: r.concept,
    notes: r.notes || null,
  };
  if (r.installment && r.web_total) {
    payment.payment_kind = 'web';
    payment.web_total = Number(r.web_total);
    payment.installment = r.installment;
  }
  const invalid = validatePayment(payment);
  if (invalid) throw httpError(400, invalid);

  const claim = await fetch(`${SB_URL}/rest/v1/receivables?id=eq.${id}&status=eq.pendiente`, {
    method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ status: 'cobrado' }),
  });
  if (!claim.ok) throw httpError(502, `Supabase receivables PATCH ${claim.status}`);
  if (!(await claim.json()).length) throw httpError(409, 'Este cobro ya se ha procesado');

  let created;
  try {
    created = await sbInsert('payments', payment);
  } catch (err) {
    await sbUpdate('receivables', id, { status: 'pendiente' }); // se deshace para poder reintentar
    throw err;
  }
  const updated = await sbUpdate('receivables', id, { payment_id: created.id });
  await logActivity('payment', created.id, 'created',
    `Pago recibido de ${created.amount}€ · ${r.concept}`, { client_id: r.client_id, receivable_id: id });
  await logActivity('receivable', id, 'paid', `Cobro de ${r.amount}€ marcado como cobrado: ${r.concept}`);
  return { receivable: updated, payment: created };
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { id, status, client_id, action } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=due_date.asc,id.asc&limit=1000';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('receivables', params));
    }

    if (req.method === 'POST' && action === 'cobrado') return res.json(await markPaid(id, req.body || {}));

    if (req.method === 'POST') {
      const n = normalizeReceivable(req.body);
      if (n.error) return res.status(400).json({ error: n.error });
      if (!n.fields.client_id) return res.status(400).json({ error: 'Selecciona el cliente que debe el importe' });
      n.fields.status = 'pendiente'; // siempre nace pendiente
      const created = await sbInsert('receivables', n.fields);
      await logActivity('receivable', created.id, 'created', `Cobro pendiente de ${created.amount}€: ${created.concept}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      const current = await loadReceivable(id);
      const n = normalizeReceivable(req.body, { partial: true });
      if (n.error) return res.status(400).json({ error: n.error });
      if (n.fields.status === 'cobrado') return res.status(400).json({ error: 'Para marcarlo como cobrado usa la acción "cobrado": así se registra el pago' });
      if (current.status === 'cobrado') return res.status(409).json({ error: 'Un cobro ya cobrado no se puede editar' });
      const updated = await sbUpdate('receivables', id, n.fields);
      if (n.fields.status && n.fields.status !== current.status) {
        await logActivity('receivable', id, 'status_changed', `Cobro "${updated.concept}" → "${n.fields.status}"`);
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      const current = await loadReceivable(id);
      if (current.status === 'cobrado') return res.status(409).json({ error: 'Un cobro ya cobrado no se elimina: borra el pago desde Pagos si fue un error' });
      await sbDelete('receivables', id);
      await logActivity('receivable', id, 'deleted', 'Cobro pendiente eliminado');
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/receivables]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
