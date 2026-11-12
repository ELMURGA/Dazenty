// lib/proposal-rules.js — Reglas de las propuestas (enviada → vista → aceptada/rechazada/caducada)
// ==========================================================
// NO es un endpoint. Funciones puras (sin red ni BD). Las usan /api/proposals,
// /api/dashboard y el aviso push de seguimientos para que una propuesta sin
// respuesta salga en "Hoy toca contactar".
// ==========================================================

import { CHANNELS, STALE_HOT_DAYS, isIsoDate, daysBetween } from './lead-rules.js';

export const PROPOSAL_STATUSES = ['enviada', 'vista', 'aceptada', 'rechazada', 'caducada'];
export const OPEN_PROPOSAL_STATUSES = ['enviada', 'vista'];
// Mismo plazo que una fase caliente sin movimiento (lead-rules)
export const PROPOSAL_STALE_DAYS = STALE_HOT_DAYS;

const validMoney = v => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e10 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
};

// Valida lo que llega del panel. Devuelve { fields } o { error }.
export function normalizeProposal(input, { partial = false } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const out = {};
  if (!partial || b.title !== undefined) {
    const title = String(b.title ?? '').trim();
    if (!title) return { error: 'El título de la propuesta es obligatorio' };
    if (title.length > 200) return { error: 'El título admite hasta 200 caracteres' };
    out.title = title;
  }
  if (b.lead_id !== undefined) out.lead_id = b.lead_id || null;
  if (b.client_id !== undefined) out.client_id = b.client_id || null;
  if (!partial && !out.lead_id && !out.client_id) return { error: 'La propuesta debe ser de un lead o de un cliente' };
  if (b.amount !== undefined) {
    if (b.amount === '' || b.amount === null) out.amount = null;
    else if (validMoney(b.amount)) out.amount = Math.round(Number(b.amount) * 100) / 100;
    else return { error: 'El importe no es válido' };
  }
  for (const key of ['sent_at', 'next_followup_at']) {
    if (b[key] === undefined) continue;
    if (b[key] === '' || b[key] === null) out[key] = null;
    else if (isIsoDate(b[key])) out[key] = b[key];
    else return { error: `${key} debe tener el formato AAAA-MM-DD` };
  }
  if (b.channel !== undefined) {
    if (b.channel === '' || b.channel === null) out.channel = null;
    else if (CHANNELS.includes(b.channel)) out.channel = b.channel;
    else return { error: `channel inválido. Usa: ${CHANNELS.join(', ')}` };
  }
  if (b.status !== undefined) {
    if (!PROPOSAL_STATUSES.includes(b.status)) return { error: `status inválido. Usa: ${PROPOSAL_STATUSES.join(', ')}` };
    out.status = b.status;
  }
  if (b.url !== undefined) {
    if (!b.url) out.url = null;
    else {
      let u;
      try { u = new URL(String(b.url)); } catch { return { error: 'El enlace de la propuesta no es válido' }; }
      if (!['https:', 'http:'].includes(u.protocol)) return { error: 'El enlace debe empezar por http o https' };
      out.url = u.href;
    }
  }
  if (b.notes !== undefined) out.notes = b.notes ? String(b.notes).slice(0, 2000) : null;
  return { fields: out };
}

// ¿Toca contactar por esta propuesta? Solo las abiertas (enviada/vista):
//  - con fecha de seguimiento: toca si es hoy o ya pasó
//  - sin fecha: toca si llevan PROPOSAL_STALE_DAYS o más sin movimiento
// `updated_at` cuenta como movimiento (cambiar de estado, editar…); si no, la fecha de envío.
export function proposalFollowup(p, today) {
  if (!p || !OPEN_PROPOSAL_STATUSES.includes(p.status)) return { due: false };
  if (p.next_followup_at) {
    const over = daysBetween(p.next_followup_at, today);
    return over !== null && over >= 0
      ? { due: true, overdueDays: over, reason: over === 0 ? 'hoy' : 'vencido' }
      : { due: false };
  }
  const ref = [p.updated_at, p.sent_at, p.created_at].filter(Boolean).sort().pop();
  const idle = ref ? daysBetween(ref, today) : null;
  return idle !== null && idle >= PROPOSAL_STALE_DAYS
    ? { due: true, overdueDays: idle, reason: 'sin_movimiento' }
    : { due: false };
}

// Mapa lead_id → { overdueDays, reason, title } con la propuesta más atrasada de cada lead
export function proposalDueByLead(proposals, today) {
  const map = new Map();
  for (const p of proposals) {
    if (!p.lead_id) continue;
    const f = proposalFollowup(p, today);
    if (!f.due) continue;
    const prev = map.get(p.lead_id);
    if (!prev || f.overdueDays > prev.overdueDays) {
      map.set(p.lead_id, { overdueDays: f.overdueDays, reason: f.reason, title: p.title, proposal_id: p.id });
    }
  }
  return map;
}
