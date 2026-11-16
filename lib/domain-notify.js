// lib/domain-notify.js — Envío del aviso de caducidad de un dominio al cliente (email vía Resend)
// ==========================================================
// Lo usan /api/push-cron (automático, al entrar un dominio en su fase de aviso) y
// /api/domains?action=notify (botón «Avisar al cliente» del panel). El aviso también se
// ve dentro del portal del cliente (ver /api/clients?slug=…).
// ==========================================================

import { sbSelect, sbUpdate, logActivity } from './db.js';
import { clientDomainEmail, domainStatus } from './domain-rules.js';

export const SITE_URL = 'https://dazenty.com';

// Devuelve { sent: true } o { sent: false, reason } (nunca lanza por un fallo de envío)
export async function emailClientAboutDomain(domain, today) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, reason: 'RESEND_API_KEY no configurada' };
  if (!domain.client_id) return { sent: false, reason: 'El dominio no tiene cliente asignado' };
  const [client] = await sbSelect('clients',
    `id=eq.${encodeURIComponent(domain.client_id)}&select=id,client_name,client_contact_name,client_contact_email,slug,portal_token&limit=1`);
  const to = String(client?.client_contact_email || '').trim();
  if (!to) return { sent: false, reason: 'El cliente no tiene email' };

  const days = domainStatus(domain, today).days;
  const portalUrl = client.slug && client.portal_token
    ? `${SITE_URL}/portal?id=${encodeURIComponent(client.slug)}&t=${encodeURIComponent(client.portal_token)}` : '';
  const mail = clientDomainEmail({
    domain: domain.domain, expires_at: domain.expires_at, days,
    contactName: client.client_contact_name || client.client_name, portalUrl,
  });
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Dazenty <noreply@dazenty.com>', to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
  });
  if (!r.ok) {
    console.error('[domain-notify] Resend', r.status);
    return { sent: false, reason: `Resend ${r.status}` };
  }
  await sbUpdate('domains', domain.id, { client_notified_at: new Date().toISOString() });
  await logActivity('domain', domain.id, 'client_notified', `Aviso de caducidad de ${domain.domain} enviado a ${client.client_name}`,
    { client_id: client.id, days });
  return { sent: true };
}
