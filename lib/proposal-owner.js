// lib/proposal-owner.js — A quién pertenece una propuesta creada con el comando /presupuesto
// ==========================================================
// NO es un endpoint. Funciones puras: dado el nombre del cliente que sale en la propuesta y los
// leads/clientes candidatos, decide a cuál se enlaza. Lo usa /api/proposals?action=register.
// ==========================================================

const LEGAL_SUFFIX = /\b(s\.?\s?l\.?\s?u?|s\.?\s?a\.?|s\.?\s?c\.?|c\.?\s?b\.?|llc|ltd|inc|gmbh|limited)\b\.?/g;

// "Bodegas Acosta, S.L." y "bodegas acosta" son lo mismo
export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(LEGAL_SUFFIX, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const leadNames = l => [l.company, l.name].map(normalizeName).filter(Boolean);
const clientNames = c => [c.client_name, c.company_name].map(normalizeName).filter(Boolean);
const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));

// Devuelve { type: 'lead'|'client'|'none'|'ambiguous', row?, candidates?, exact? }
//  1. coincidencia exacta con un lead abierto, luego con un cliente, luego con un lead cerrado
//  2. si no hay exacta, una única coincidencia parcial; si hay varias, ambiguo (que decida una persona)
export function pickOwner(name, leads, clients) {
  const target = normalizeName(name);
  if (!target) return { type: 'none' };
  const open = leads.filter(l => !['ganado', 'perdido'].includes(l.stage));

  const exactOpen = open.filter(l => leadNames(l).includes(target)).sort(byNewest);
  if (exactOpen.length === 1) return { type: 'lead', row: exactOpen[0], exact: true };
  if (exactOpen.length > 1) return { type: 'ambiguous', candidates: exactOpen.map(l => ({ type: 'lead', id: l.id, name: l.company || l.name })) };

  const exactClients = clients.filter(c => clientNames(c).includes(target));
  if (exactClients.length === 1) return { type: 'client', row: exactClients[0], exact: true };
  if (exactClients.length > 1) return { type: 'ambiguous', candidates: exactClients.map(c => ({ type: 'client', id: c.id, name: c.client_name })) };

  const exactClosed = leads.filter(l => leadNames(l).includes(target)).sort(byNewest);
  if (exactClosed.length) return { type: 'lead', row: exactClosed[0], exact: true };

  const partial = [
    ...open.filter(l => leadNames(l).some(n => n.includes(target) || target.includes(n))).map(l => ({ type: 'lead', row: l })),
    ...clients.filter(c => clientNames(c).some(n => n.includes(target) || target.includes(n))).map(c => ({ type: 'client', row: c })),
  ];
  if (partial.length === 1) return { type: partial[0].type, row: partial[0].row, exact: false };
  if (partial.length > 1) {
    return { type: 'ambiguous', candidates: partial.map(p => ({ type: p.type, id: p.row.id, name: p.type === 'lead' ? (p.row.company || p.row.name) : p.row.client_name })) };
  }
  return { type: 'none' };
}
