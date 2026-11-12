// lib/lead-rules.js — Reglas de seguimiento de leads
// ==========================================================
// NO es un endpoint. Funciones puras (sin red ni BD) para poder testearlas.
// Las usan /api/leads, /api/dashboard y el aviso push de seguimientos.
// ==========================================================

export const CLOSED_STAGES = ['ganado', 'perdido'];
export const HOT_STAGES = ['propuesta', 'reunion'];
export const TEMPERATURES = ['caliente', 'templado', 'frio'];
export const CHANNELS = ['whatsapp', 'instagram', 'email', 'llamada', 'reunion', 'otro'];

// Días sin movimiento a partir de los cuales un lead en fase caliente pide seguimiento
export const STALE_HOT_DAYS = 5;
// Días hasta el siguiente seguimiento que se propone al registrar un contacto
export const NEXT_FOLLOWUP_HOT_DAYS = 3;
export const NEXT_FOLLOWUP_DEFAULT_DAYS = 7;

const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value) {
  if (!DATE_RE.test(String(value))) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Días enteros entre dos fechas (YYYY-MM-DD o ISO completo); positivo si `to` es posterior
export function daysBetween(from, to) {
  const a = Date.parse(String(from).slice(0, 10));
  const b = Date.parse(String(to).slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY_MS);
}

export function suggestNextFollowup(stage, today) {
  return addDays(today, HOT_STAGES.includes(stage) ? NEXT_FOLLOWUP_HOT_DAYS : NEXT_FOLLOWUP_DEFAULT_DAYS);
}

// Estado de seguimiento de un lead:
//  - cerrado (ganado/perdido) → nunca toca
//  - ha respondido y falta contestar (awaiting_reply) → toca siempre, es lo primero
//  - con fecha de seguimiento → toca si es hoy o ya pasó
//  - fase caliente sin fecha → toca si lleva STALE_HOT_DAYS o más sin movimiento
//  - propuesta enviada/vista sin movimiento (extra.proposalDue, ver lib/proposal-rules.js)
// Las fases tempranas sin fecha no avisan: con cientos de leads, avisar de todos no sirve.
export function followupStatus(lead, today, extra = {}) {
  if (!lead || CLOSED_STAGES.includes(lead.stage)) return { due: false };
  if (lead.awaiting_reply) {
    const waiting = lead.replied_at ? daysBetween(lead.replied_at, today) : 0;
    return { due: true, awaiting: true, overdueDays: Math.max(waiting || 0, 0), reason: 'respondio' };
  }
  const base = baseFollowup(lead, today);
  const prop = extra.proposalDue && extra.proposalDue.get(lead.id);
  if (prop) {
    // La propuesta sin respuesta se suma al motivo que ya hubiera; el retraso es el mayor de los dos
    return {
      due: true,
      proposal: true,
      overdueDays: Math.max(base.overdueDays || 0, prop.overdueDays || 0),
      reason: base.due ? base.reason : 'propuesta',
    };
  }
  return base;
}

function baseFollowup(lead, today) {
  if (lead.next_followup_at) {
    const overdue = daysBetween(lead.next_followup_at, today);
    if (overdue !== null && overdue >= 0) {
      return { due: true, overdueDays: overdue, reason: overdue === 0 ? 'hoy' : 'vencido' };
    }
    return { due: false };
  }
  if (HOT_STAGES.includes(lead.stage)) {
    const ref = lead.last_contact_at || lead.updated_at || lead.created_at;
    const idle = ref ? daysBetween(ref, today) : null;
    if (idle !== null && idle >= STALE_HOT_DAYS) return { due: true, overdueDays: idle, reason: 'sin_movimiento' };
  }
  return { due: false };
}

// Más alto = más urgente. Orden: fase caliente, temperatura, retraso y valor.
export function leadPriority(lead, today, extra = {}) {
  let score = 0;
  if (lead.awaiting_reply) score += 1000; // si ha respondido, se contesta antes que nada (supera a cualquier otra puntuación)
  if (lead.stage === 'reunion') score += 60;
  else if (lead.stage === 'propuesta') score += 50;
  if (lead.temperature === 'caliente') score += 30;
  else if (lead.temperature === 'templado') score += 10;
  const st = followupStatus(lead, today, extra);
  if (st.due) score += 20 + Math.min(st.overdueDays || 0, 30);
  if (st.proposal) score += 15;
  score += Math.min(Number(lead.value_estimate) || 0, 10000) / 500; // hasta +20
  return score;
}

// Ordena por urgencia y devuelve solo los que tocan contactar
export function dueFollowups(leads, today, extra = {}) {
  return leads
    .map(l => ({ lead: l, status: followupStatus(l, today, extra) }))
    .filter(x => x.status.due)
    .sort((a, b) => leadPriority(b.lead, today, extra) - leadPriority(a.lead, today, extra))
    .map(x => ({ ...x.lead, followup: x.status }));
}

// Embudo: cuántos leads hay en cada fase y qué porcentaje avanza
export function funnel(leads) {
  const counts = {};
  for (const l of leads) counts[l.stage] = (counts[l.stage] || 0) + 1;
  const total = leads.length;
  const contacted = total - (counts.nuevo || 0) - (counts.email_no_enviado || 0);
  const advanced = (counts.propuesta || 0) + (counts.reunion || 0) + (counts.ganado || 0);
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  return {
    counts,
    total,
    contacted,
    advanced,
    won: counts.ganado || 0,
    contacted_pct: pct(contacted, total),
    advanced_of_contacted_pct: pct(advanced, contacted),
    won_of_contacted_pct: pct(counts.ganado || 0, contacted),
  };
}

// Origen agrupado ("n8n-cordoba" y "n8n-chile" → "n8n"); lo vacío cuenta como "manual"
export function sourceGroup(source) {
  const s = String(source || '').trim().toLowerCase();
  if (!s) return 'manual';
  return s.split(/[\s:\-_/]/)[0] || 'manual';
}

// Rendimiento por origen: cuántos leads trae cada canal y cuántos avanzan
export function bySource(leads) {
  const map = new Map();
  for (const l of leads) {
    const key = sourceGroup(l.source);
    const row = map.get(key) || { source: key, total: 0, contacted: 0, advanced: 0, won: 0 };
    row.total++;
    if (!['nuevo', 'email_no_enviado'].includes(l.stage)) row.contacted++;
    if (['propuesta', 'reunion', 'ganado'].includes(l.stage)) row.advanced++;
    if (l.stage === 'ganado') row.won++;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

// Valida lo que llega del panel para las columnas de seguimiento. Devuelve { fields } o { error }.
export function normalizeFollowupFields(input) {
  const out = {};
  if (input.temperature !== undefined) {
    if (input.temperature === '' || input.temperature === null) out.temperature = null;
    else if (TEMPERATURES.includes(input.temperature)) out.temperature = input.temperature;
    else return { error: `temperature inválida. Usa: ${TEMPERATURES.join(', ')}` };
  }
  if (input.channel !== undefined) {
    if (input.channel === '' || input.channel === null) out.channel = null;
    else if (CHANNELS.includes(input.channel)) out.channel = input.channel;
    else return { error: `channel inválido. Usa: ${CHANNELS.join(', ')}` };
  }
  if (input.next_followup_at !== undefined) {
    if (input.next_followup_at === '' || input.next_followup_at === null) out.next_followup_at = null;
    else if (isIsoDate(input.next_followup_at)) out.next_followup_at = input.next_followup_at;
    else return { error: 'next_followup_at debe tener el formato AAAA-MM-DD' };
  }
  return { fields: out };
}

// Texto del aviso diario de seguimientos (null si no hay nada que avisar)
export function followupsMessage(due) {
  if (!due.length) return null;
  const lines = due.slice(0, 5).map(l =>
    `• ${l.followup?.awaiting ? 'Ha respondido: ' : ''}${l.name}${l.company && l.company !== l.name ? ` (${l.company})` : ''}`);
  if (due.length > 5) lines.push(`… y ${due.length - 5} más`);
  const waiting = due.filter(l => l.followup?.awaiting).length;
  return {
    title: waiting
      ? `${waiting} lead${waiting === 1 ? '' : 's'} esperando respuesta · toca contactar ${due.length}`
      : `Toca contactar ${due.length} lead${due.length === 1 ? '' : 's'}`,
    body: lines.join('\n'),
    url: '/admin#leads',
  };
}
