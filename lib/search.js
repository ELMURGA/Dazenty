// lib/search.js — Búsqueda global del panel (leads, clientes, tareas, oportunidades)
// ==========================================================
// NO es un endpoint. Prepara el texto del buscador para usarlo dentro de un filtro `or=`
// de PostgREST con ilike, sin que los comodines ni los caracteres reservados del usuario
// cambien la consulta. Lo usa /api/search.
// ==========================================================

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 60;
export const SEARCH_LIMIT = 8;

// Campos donde se busca en cada tabla
export const SEARCH_FIELDS = {
  leads: ['name', 'company', 'email', 'phone', 'whatsapp', 'instagram', 'notes'],
  clients: ['client_name', 'company_name', 'client_contact_name', 'client_contact_email', 'slug'],
  tasks: ['title', 'description'],
  opportunities: ['title', 'description'],
};

// Texto seguro: quita lo que rompe la sintaxis de `or=(a.ilike.x,b.ilike.y)` y escapa los
// comodines de LIKE (% y _), que en el buscador son letras normales. Devuelve '' si no
// queda nada útil.
export function sanitizeSearch(raw) {
  const q = String(raw ?? '')
    .replace(/[*,()"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_MAX);
  return q.replace(/[%_]/g, m => `\\${m}`);
}

// Un número escrito con espacios o signos ("657 12 34 56", "+34 657…") también debe encontrar
// teléfonos guardados sin ellos
function digitsVariant(raw) {
  const text = String(raw ?? '').trim();
  if (!/^[\d\s+().-]+$/.test(text)) return '';
  const digits = text.replace(/\D/g, '');
  return digits.length >= 3 ? digits : '';
}

// Filtro `or=(...)` ya listo para la URL (sin codificar) o '' si la búsqueda no es válida
export function buildOrFilter(table, raw) {
  const fields = SEARCH_FIELDS[table];
  const q = sanitizeSearch(raw);
  if (!fields || q.length < SEARCH_MIN) return '';
  const terms = fields.map(f => `${f}.ilike.*${q}*`);
  const digits = digitsVariant(raw);
  if (digits && ['phone', 'whatsapp'].some(f => fields.includes(f))) {
    for (const f of ['phone', 'whatsapp']) terms.push(`${f}.ilike.*${digits}*`);
  }
  return `(${terms.join(',')})`;
}
