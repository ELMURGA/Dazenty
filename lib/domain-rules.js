// lib/domain-rules.js — Dominios comprados y sus caducidades
// ==========================================================
// NO es un endpoint. Funciones puras (sin red ni BD) para poder testearlas.
// Las usan /api/domains, /api/push-cron (aviso al móvil y email al cliente),
// /api/clients (aviso en el portal) y /api/dashboard.
//
// Avisos: cuando falta un mes (30 d), cuando falta una semana (7 d) y cuando caduca.
// `alert_stage` guarda el último aviso enviado para no repetirlo cada día.
// ==========================================================

import { isIsoDate, daysBetween } from './lead-rules.js';

export const DOMAIN_ALERT_DAYS = 30;
export const DOMAIN_URGENT_DAYS = 7;
// Un dominio caducado hace más de esto deja de avisar (ya está perdido o no se va a renovar)
export const DOMAIN_EXPIRED_GRACE_DAYS = 45;

const STAGE_RANK = { null: 0, '30d': 1, '7d': 2, expired: 3 };
const HOST_RE = /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

const validMoney = v => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e7 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
};

// "https://www.Mi-Web.es/inicio" → "www.mi-web.es" (sin protocolo, ruta ni puerto)
export function cleanDomainName(value) {
  let v = String(value ?? '').trim().toLowerCase();
  v = v.replace(/^[a-z]+:\/\//, '').split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
  return v;
}

// Valida lo que llega del panel. `partial` = edición. Devuelve { fields } o { error }.
export function normalizeDomain(input, { partial = false } = {}) {
  const b = input && typeof input === 'object' ? input : {};
  const out = {};
  if (!partial || b.domain !== undefined) {
    const domain = cleanDomainName(b.domain);
    if (!domain) return { error: 'El dominio es obligatorio' };
    if (!HOST_RE.test(domain)) return { error: 'El dominio no es válido (por ejemplo: miempresa.es)' };
    out.domain = domain;
  }
  if (!partial || b.expires_at !== undefined) {
    if (!isIsoDate(b.expires_at)) return { error: 'La fecha de caducidad es obligatoria (AAAA-MM-DD)' };
    out.expires_at = b.expires_at;
  }
  if (b.registered_at !== undefined) {
    if (b.registered_at === '' || b.registered_at === null) out.registered_at = null;
    else if (isIsoDate(b.registered_at)) out.registered_at = b.registered_at;
    else return { error: 'La fecha de compra debe tener el formato AAAA-MM-DD' };
  }
  if (b.client_id !== undefined) out.client_id = b.client_id || null;
  if (b.registrar !== undefined) out.registrar = b.registrar ? String(b.registrar).trim().slice(0, 80) : null;
  if (b.notes !== undefined) out.notes = b.notes ? String(b.notes).slice(0, 1000) : null;
  if (b.renewal_price !== undefined) {
    if (b.renewal_price === '' || b.renewal_price === null) out.renewal_price = null;
    else if (validMoney(b.renewal_price)) out.renewal_price = Math.round(Number(b.renewal_price) * 100) / 100;
    else return { error: 'El precio no es válido' };
  }
  if (b.notify_client !== undefined) out.notify_client = b.notify_client === true || b.notify_client === 'true';
  return { fields: out };
}

// Días que quedan (negativo = ya caducó) y estado visual
export function domainStatus(d, today) {
  const days = d && d.expires_at ? daysBetween(today, d.expires_at) : null;
  if (days === null) return { days: null, state: 'ok', stage: null };
  const stage = days < 0 ? 'expired' : days <= DOMAIN_URGENT_DAYS ? '7d' : days <= DOMAIN_ALERT_DAYS ? '30d' : null;
  const state = days < 0 ? 'expired' : days <= DOMAIN_URGENT_DAYS ? 'urgent' : days <= DOMAIN_ALERT_DAYS ? 'soon' : 'ok';
  return { days, state, stage };
}

// Avisos que tocan enviar hoy: el dominio ha entrado en una fase de aviso más avanzada que la última enviada.
export function pendingDomainAlerts(domains, today) {
  const out = [];
  for (const d of domains) {
    const st = domainStatus(d, today);
    if (!st.stage) continue;
    if (st.days < -DOMAIN_EXPIRED_GRACE_DAYS) continue;
    if (STAGE_RANK[st.stage] <= STAGE_RANK[d.alert_stage || null]) continue;
    out.push({ ...d, days: st.days, stage: st.stage });
  }
  return out.sort((a, b) => a.days - b.days);
}

// Dominios a mostrar al cliente en su portal: los suyos que caducan en un mes (o ya caducaron hace poco)
export function portalDomains(domains, today) {
  return domains
    .filter(d => d.notify_client !== false)
    .map(d => ({ domain: d.domain, expires_at: d.expires_at, days: domainStatus(d, today).days }))
    .filter(d => d.days !== null && d.days <= DOMAIN_ALERT_DAYS && d.days >= -DOMAIN_EXPIRED_GRACE_DAYS)
    .sort((a, b) => a.days - b.days);
}

const when = days => days < 0 ? `caducó hace ${-days} día${days === -1 ? '' : 's'}`
  : days === 0 ? 'caduca hoy' : days === 1 ? 'caduca mañana' : `caduca en ${days} días`;

// Texto del aviso al móvil de Alejandro
export function domainsMessage(alerts) {
  if (!alerts.length) return null;
  const lines = alerts.slice(0, 6).map(a => `• ${a.domain} ${when(a.days)}${a.client_name ? ` (${a.client_name})` : ''}`);
  if (alerts.length > 6) lines.push(`… y ${alerts.length - 6} más`);
  return {
    title: alerts.length === 1 ? 'Dominio a punto de caducar' : `Dominios a punto de caducar (${alerts.length})`,
    body: lines.join('\n'),
    url: '/admin#domains',
  };
}

const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function formatDateEs(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso || '');
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Email automático al cliente (asunto + html + texto). `portalUrl` es opcional.
export function clientDomainEmail({ domain, expires_at, days, contactName, portalUrl }) {
  const hello = contactName ? `Hola ${String(contactName).trim().split(/\s+/)[0]},` : 'Hola,';
  const date = formatDateEs(expires_at);
  const lead = days < 0
    ? `el dominio <strong>${escHtml(domain)}</strong> caducó el ${escHtml(date)}.`
    : `el dominio <strong>${escHtml(domain)}</strong> caduca el ${escHtml(date)} (${when(days)}).`;
  const subject = days < 0 ? `Tu dominio ${domain} ha caducado` : `Tu dominio ${domain} caduca pronto`;
  const text = `${hello}\n\n${lead.replace(/<[^>]+>/g, '')}\n\nPara que tu web y tu correo sigan funcionando sin cortes, necesitamos renovarlo. Respóndeme a este correo o escríbeme por WhatsApp y me encargo de todo.\n\nAlejandro · Dazenty`;
  const html = `<!DOCTYPE html><html><body style="margin:0;background:#050505;font-family:Inter,Arial,sans-serif;color:#EAEAEA">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#121212;border:1px solid #222;border-radius:16px">
<tr><td style="padding:32px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#d97762">Aviso de dominio</p>
<h1 style="margin:0 0 20px;font-size:22px;color:#fff">${days < 0 ? 'Tu dominio ha caducado' : 'Tu dominio caduca pronto'}</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escHtml(hello)}</p>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${lead}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#b5b5b5">Para que tu web y tu correo sigan funcionando sin cortes, necesitamos renovarlo. Respóndeme a este correo o escríbeme por WhatsApp y me encargo de todo.</p>
${portalUrl ? `<p style="margin:0 0 22px"><a href="${escHtml(portalUrl)}" style="display:inline-block;background:#d97762;color:#000;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:12px;font-size:14px">Ver mi portal</a></p>` : ''}
<p style="margin:0;font-size:14px;color:#8a8a8a">Alejandro · Dazenty</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text };
}
