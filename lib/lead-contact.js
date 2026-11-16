// lib/lead-contact.js — Por qué canal se ha contactado a un lead (email, WhatsApp o ambos)
// ==========================================================
// NO es un endpoint. Funciones puras. Las usa /api/webhook-lead (lo que manda n8n) y
// /api/leads (contacto registrado a mano). El panel (admin.html) tiene la misma lógica de
// lectura en leadContactChannels(): si se cambia aquí, cambiarla allí.
// ==========================================================

// n8n puede decirlo de forma explícita (contact_channel / mark_whatsapp_contacted) o, en los flujos
// antiguos, solo con la nota "Contactado por WhatsApp (fecha)". Se aceptan las tres formas.
export function isWhatsappContact(body) {
  if (!body) return false;
  if (body.mark_whatsapp_contacted === true || body.contact_channel === 'whatsapp') return true;
  return /contactad[oa]\s+por\s+whatsapp/i.test(String(body.notes_append || ''));
}

// Contacto por email: explícito, o el paso «marcar contactada» de los flujos de email.
// "Email NO enviado: ya se le había escrito antes" no es un contacto nuevo.
export function isEmailContact(body) {
  if (!body || isWhatsappContact(body)) return false;
  if (body.contact_channel === 'email') return true;
  if (body.stage !== 'contactada') return false;
  return !/\bno\s+enviado\b/i.test(String(body.notes_append || ''));
}

// Canales por los que consta contacto, a partir de las fechas por canal y del último contacto registrado.
// Devuelve [{ key: 'email'|'whatsapp', at: ISO|null }] sin repetir canal.
export function contactChannels(lead) {
  const out = [];
  const email = lead.email_contacted_at || (lead.channel === 'email' ? lead.last_contact_at : null);
  const wa = lead.whatsapp_contacted_at || (lead.channel === 'whatsapp' ? lead.last_contact_at : null);
  if (email) out.push({ key: 'email', at: email });
  if (wa) out.push({ key: 'whatsapp', at: wa });
  return out;
}
