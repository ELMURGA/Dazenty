// lib/renewal-rules.js — Renovaciones de mantenimiento próximas (bloque del Inicio)
// ==========================================================
// NO es un endpoint. Reutiliza coverageRenewal de lib/opportunity-rules.js (la misma
// regla que genera las oportunidades de renovación), solo con otra ventana de fechas.
// ==========================================================

import { coverageRenewal } from './opportunity-rules.js';

export const RENEWAL_HORIZON_DAYS = 60;

// Servicios cuya cobertura vence en los próximos `days` días (o venció hace poco y sigue
// sin renovarse). Los que vencen antes, primero.
export function upcomingRenewals(clients, payments, today, days = RENEWAL_HORIZON_DAYS) {
  const byClient = {};
  for (const p of payments) (byClient[p.client_id] ||= []).push(p);
  const out = [];
  for (const client of clients) {
    const r = coverageRenewal(client, byClient[client.id] || [], today, { daysBefore: days });
    if (!r) continue;
    out.push({
      client_id: client.id,
      client_name: client.client_name,
      service: r.service_concept || client.service_name || 'Mantenimiento',
      coverage_end: r.coverage_end,
      amount: r.amount,
      expired: r.expired,
      days_left: Math.round((Date.parse(r.coverage_end) - Date.parse(today)) / 86400000),
      whatsapp: client.client_contact_phone || null,
      contact_name: client.client_contact_name || null,
    });
  }
  return out.sort((a, b) => a.coverage_end.localeCompare(b.coverage_end));
}
