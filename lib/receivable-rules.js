// lib/receivable-rules.js — Reglas de los cobros pendientes (lo que un cliente debe)
// ==========================================================
// NO es un endpoint. Funciones puras (sin red ni BD) para poder testearlas.
// Las usan /api/receivables, /api/dashboard y el aviso push de cobros.
// ==========================================================

import { isIsoDate, daysBetween } from './lead-rules.js';

export const RECEIVABLE_STATUSES = ['pendiente', 'cobrado', 'cancelado'];
export const INSTALLMENTS = ['primera_mitad', 'segunda_mitad', 'otro'];

const money = n => Math.round(Number(n) * 100) / 100;
const validAmount = v => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0.01 && n < 1e10 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
};

// Valida lo que llega del panel. `partial` = edición (solo los campos enviados).
// Devuelve { fields } o { error }.
export function normalizeReceivable(input, { partial = false } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const out = {};
  if (!partial || b.concept !== undefined) {
    const concept = String(b.concept ?? '').trim();
    if (!concept) return { error: 'El concepto es obligatorio' };
    if (concept.length > 200) return { error: 'El concepto admite hasta 200 caracteres' };
    out.concept = concept;
  }
  if (!partial || b.amount !== undefined) {
    if (!validAmount(b.amount)) return { error: 'El importe debe ser positivo y tener como máximo dos decimales' };
    out.amount = money(b.amount);
  }
  if (!partial || b.due_date !== undefined) {
    if (!isIsoDate(b.due_date)) return { error: 'El vencimiento debe tener el formato AAAA-MM-DD' };
    out.due_date = b.due_date;
  }
  if (b.client_id !== undefined) out.client_id = b.client_id || null;
  if (b.notes !== undefined) out.notes = b.notes ? String(b.notes).slice(0, 1000) : null;
  if (b.installment !== undefined) {
    if (b.installment === '' || b.installment === null) out.installment = null;
    else if (INSTALLMENTS.includes(b.installment)) out.installment = b.installment;
    else return { error: `installment inválido. Usa: ${INSTALLMENTS.join(', ')}` };
  }
  if (b.web_total !== undefined) {
    if (b.web_total === '' || b.web_total === null) out.web_total = null;
    else if (validAmount(b.web_total)) out.web_total = money(b.web_total);
    else return { error: 'El precio total de la web no es válido' };
  }
  if (b.status !== undefined) {
    if (!RECEIVABLE_STATUSES.includes(b.status)) return { error: `status inválido. Usa: ${RECEIVABLE_STATUSES.join(', ')}` };
    out.status = b.status;
  }
  return { fields: out };
}

// Estado de un cobro pendiente respecto a hoy
export function receivableState(r, today) {
  if (!r || r.status !== 'pendiente') return { open: false };
  const late = daysBetween(r.due_date, today);
  if (late === null) return { open: true, overdue: false, today: false, days: 0 };
  return { open: true, overdue: late > 0, today: late === 0, days: late };
}

// Pendientes con el vencimiento hoy o pasado: lo que toca reclamar. Los más atrasados primero.
export function dueReceivables(rows, today) {
  return rows
    .map(r => ({ ...r, state: receivableState(r, today) }))
    .filter(r => r.state.open && (r.state.overdue || r.state.today))
    .sort((a, b) => b.state.days - a.state.days || Number(b.amount) - Number(a.amount));
}

// Resumen para la tarjeta del inicio: totales y lista con los vencidos primero
export function summarizeReceivables(rows, today, limit = 6) {
  const open = rows
    .map(r => ({ ...r, state: receivableState(r, today) }))
    .filter(r => r.state.open);
  const overdue = open.filter(r => r.state.overdue);
  const sorted = [...open].sort((a, b) => {
    if (a.state.overdue !== b.state.overdue) return a.state.overdue ? -1 : 1;
    if (a.state.overdue) return b.state.days - a.state.days; // el más atrasado primero
    return String(a.due_date).localeCompare(String(b.due_date)); // luego el que vence antes
  });
  return {
    count: open.length,
    total: money(open.reduce((s, r) => s + Number(r.amount), 0)),
    overdue_count: overdue.length,
    overdue_total: money(overdue.reduce((s, r) => s + Number(r.amount), 0)),
    items: sorted.slice(0, limit),
  };
}

// Texto del aviso diario de cobros (null si no hay nada vencido ni que venza hoy)
export function receivablesMessage(due, nameOf = () => '') {
  if (!due.length) return null;
  const total = money(due.reduce((s, r) => s + Number(r.amount), 0));
  const overdue = due.filter(r => r.state?.overdue).length;
  const fmt = n => `${money(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`;
  const lines = due.slice(0, 5).map(r => {
    const who = nameOf(r);
    return `• ${who ? `${who}: ` : ''}${fmt(r.amount)} · ${r.concept}`;
  });
  if (due.length > 5) lines.push(`… y ${due.length - 5} más`);
  return {
    title: `Cobros pendientes: ${fmt(total)}`,
    body: `${overdue ? `${overdue} vencido${overdue === 1 ? '' : 's'}\n` : ''}${lines.join('\n')}`,
    url: '/admin#payments',
  };
}
