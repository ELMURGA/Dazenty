// lib/message-templates.js — Plantillas de mensaje (WhatsApp / email)
// ==========================================================
// NO es un endpoint. Funciones puras para validar plantillas, rellenar variables y
// construir el enlace de WhatsApp. La misma lógica de rellenado vive en admin.html
// (fillMessageTemplate): si se cambia aquí, cambiarla allí.
// ==========================================================

export const TEMPLATE_VARIABLES = ['nombre', 'empresa', 'importe', 'enlace'];
export const TEMPLATE_CATEGORIES = ['lead', 'propuesta', 'cobro', 'demo', 'reunion', 'renovacion', 'general'];
const NAME_MAX = 80;
const BODY_MAX = 2000;

export function normalizeTemplate(input, { partial = false } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const out = {};
  if (!partial || b.name !== undefined) {
    const name = String(b.name ?? '').trim();
    if (!name) return { error: 'El nombre de la plantilla es obligatorio' };
    if (name.length > NAME_MAX) return { error: `El nombre admite hasta ${NAME_MAX} caracteres` };
    out.name = name;
  }
  if (!partial || b.body !== undefined) {
    const body = String(b.body ?? '').trim();
    if (!body) return { error: 'El texto de la plantilla es obligatorio' };
    if (body.length > BODY_MAX) return { error: `El texto admite hasta ${BODY_MAX} caracteres` };
    out.body = body;
  }
  if (b.category !== undefined) {
    if (!TEMPLATE_CATEGORIES.includes(b.category)) return { error: `category inválida. Usa: ${TEMPLATE_CATEGORIES.join(', ')}` };
    out.category = b.category;
  }
  if (b.active !== undefined) out.active = b.active === true;
  return { fields: out };
}

// Sustituye {nombre}, {empresa}, {importe} y {enlace}. Las variables sin valor se dejan tal cual
// y se devuelven en `missing` para que quien escribe las complete antes de enviar.
export function fillTemplate(body, vars = {}) {
  const missing = [];
  const text = String(body || '').replace(/\{(nombre|empresa|importe|enlace)\}/g, (match, key, offset, whole) => {
    const v = vars[key] == null ? '' : String(vars[key]).trim();
    if (!v) {
      if (!missing.includes(key)) missing.push(key);
      return match;
    }
    // "Acosta S.L." seguido del punto de la frase no debe quedar como "S.L.."
    return v.endsWith('.') && whole[offset + match.length] === '.' ? v.slice(0, -1) : v;
  });
  return { text, missing };
}

// "1.200 €" / "200 €" / "35,5 €"
export function formatEuros(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`;
}

// Enlace wa.me con el mensaje precargado. Un móvil/fijo español de 9 cifras recibe el prefijo 34.
// Devuelve '' si no hay un número usable.
export function whatsappLink(phone, text = '') {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 9 && /^[6789]/.test(digits)) digits = '34' + digits;
  if (digits.length < 10 || digits.length > 15) return '';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// Nombre de pila para saludar ("Ana Pérez" → "Ana")
export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}
