// lib/stripe-sync.js — Registra en "Pagos" los cobros de suscripciones de Stripe
// ==========================================================
// Cada factura pagada de Stripe se guarda como una fila de payments con
// stripe_payment_id = id de la factura (in_...). El índice único sobre esa
// columna (migración 013) hace que registrar dos veces la misma no duplique nada,
// así que lo pueden llamar a la vez el webhook y el panel de Inicio.
// ==========================================================

import { SB_URL, sbHeaders, sbSelect, logActivity } from './db.js';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

// Fecha YYYY-MM-DD en hora de Madrid a partir de un timestamp Unix de Stripe
function madridDate(unixSeconds) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date(unixSeconds * 1000));
}

// Convierte una factura pagada de Stripe en la fila de payments correspondiente.
// Devuelve null si no hay nada que registrar (importe 0, sin pagar...).
export function stripeInvoiceToPayment(invoice, client) {
  if (!invoice?.id || invoice.status !== 'paid' || !client?.id) return null;
  const amount = Math.round(Number(invoice.amount_paid || 0)) / 100;
  if (amount < 0.01) return null;

  const paidAt = invoice.status_transitions?.paid_at || invoice.created;
  const period = invoice.lines?.data?.[0]?.period;
  let coverage_start = null;
  let coverage_end = null;
  if (period?.start && period?.end) {
    // Stripe da el fin del período como límite exclusivo: el último día cubierto es el anterior
    coverage_start = madridDate(period.start);
    coverage_end = madridDate(period.end - 86400);
    if (coverage_end < coverage_start) coverage_end = coverage_start;
  }

  return {
    client_id: client.id,
    amount,
    payment_date: madridDate(paidAt),
    payment_method: 'stripe',
    stripe_payment_id: invoice.id,
    service_concept: (client.service_name || 'Suscripción Stripe').slice(0, 200),
    coverage_start,
    coverage_end,
    payment_kind: 'servicio',
    notes: invoice.billing_reason === 'subscription_create' ? 'Primer cobro de la suscripción (Stripe)' : 'Cobro recurrente de la suscripción (Stripe)',
  };
}

// Inserta el cobro si aún no existe. Devuelve la fila creada, o null si ya estaba.
export async function recordStripeInvoice(invoice, client) {
  const row = stripeInvoiceToPayment(invoice, client);
  if (!row) return null;
  const r = await fetch(`${SB_URL}/rest/v1/payments?on_conflict=stripe_payment_id`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`Supabase payments POST ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const [created] = await r.json();
  if (!created) return null;
  await logActivity('payment', created.id, 'created',
    `Cobro de Stripe de ${created.amount}€ · ${created.service_concept}`,
    { client_id: created.client_id, payment_method: 'stripe', stripe_invoice: invoice.id });
  return created;
}

// Registra el cobro de una factura del webhook buscando el cliente por su suscripción
export async function recordInvoiceForSubscription(invoice) {
  if (!invoice?.subscription) return null;
  const [client] = await sbSelect('clients',
    `stripe_subscription_id=eq.${encodeURIComponent(invoice.subscription)}&select=id,service_name&limit=1`);
  // Si el cliente aún no tiene la suscripción guardada (llega antes que checkout.session.completed),
  // el panel de Inicio lo recogerá en su próxima sincronización.
  if (!client) return null;
  return recordStripeInvoice(invoice, client);
}

// Repasa todas las facturas pagadas de las suscripciones y añade las que falten en Pagos
export async function syncStripeSubscriptionPayments() {
  if (!STRIPE_SECRET_KEY) return 0;
  const clients = await sbSelect('clients', 'stripe_subscription_id=not.is.null&select=id,service_name,stripe_subscription_id');
  let added = 0;
  await Promise.all(clients.map(async (client) => {
    const r = await fetch(
      `https://api.stripe.com/v1/invoices?subscription=${encodeURIComponent(client.stripe_subscription_id)}&status=paid&limit=100`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } }
    );
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error?.message || `Stripe error ${r.status}`);
    for (const invoice of body.data || []) {
      if (await recordStripeInvoice(invoice, client)) added++;
    }
  }));
  return added;
}
