// api/clients.js — CRUD de clientes en Supabase
// ==========================================================
// GET  /api/clients?slug=xxx&t=TOKEN → cliente por slug + token secreto (portal del cliente)
// GET  /api/clients            → todos los clientes (ADMIN)
// POST /api/clients            → crear cliente (ADMIN)
// PUT  /api/clients?id=xxx     → actualizar cliente (ADMIN)
// DELETE /api/clients?id=xxx   → eliminar cliente (ADMIN)
//
// Auth admin: header  x-admin-password: <ADMIN_PASSWORD env var>
// ==========================================================

import { adminAuthError, loadPortalClient } from '../lib/db.js';

const SB_URL  = process.env.SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_KEY;

const CORS = {
  'Access-Control-Allow-Origin': 'https://dazenty.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
};

const sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

// Convierte "nombre cliente" → "nombre-cliente"
function toSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Sanitiza HTML básico para evitar XSS en emails
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Normaliza el campo service_tags
function normalizeTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(t => String(t).trim()).filter(Boolean);
  if (typeof tags === 'string') return tags.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

export default async function handler(req, res) {
  // CORS
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { slug, id, t } = req.query;

  // ── GET ?slug=xxx  (público — portal del cliente) ─────────────────────────
  if (req.method === 'GET' && slug) {
    try {
      const fields = [
        'id','slug','client_name','company_name',
        'service_name','service_desc','service_tags',
        'amount_monthly','amount_annual','amount_onetime',
        'stripe_monthly_link','stripe_annual_link','stripe_onetime_link',
        'payment_note','pdf_proposal_url','pdf_invoice_url',
        'stripe_subscription_id','stripe_subscription_status','stripe_current_period_end',
      ].join(',');

      const { client, status, error } = await loadPortalClient(slug, t, fields);
      if (!client) return res.status(status).json({ error });

      // El portal solo necesita saber si existen; los identificadores internos no salen
      const { portal_token, ...portal } = client;
      portal.pdf_proposal_url = Boolean(client.pdf_proposal_url);
      portal.pdf_invoice_url = Boolean(client.pdf_invoice_url);
      portal.stripe_subscription_id = Boolean(client.stripe_subscription_id);
      return res.json(portal);
    } catch (err) {
      console.error('[clients GET slug]', err);
      return res.status(500).json({ error: 'Error del servidor' });
    }
  }

  // ── A partir de aquí, se requiere autenticación admin ─────────────────────
  const authError = await adminAuthError(req);
  if (authError) return res.status(authError.status).json({ error: authError.error });

  // ── GET todos (admin) ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      if (!SB_URL || !SB_KEY) {
        return res.status(503).json({ error: 'Variables SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas en Vercel' });
      }
      const r = await fetch(
        `${SB_URL}/rest/v1/clients?select=*&order=created_at.desc`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (!r.ok) {
        const errBody = await r.text();
        console.error('[clients GET admin]', r.status, errBody.slice(0, 300));
        return res.status(502).json({ error: `Supabase error ${r.status}` });
      }
      return res.json(await r.json());
    } catch (err) {
      console.error('[clients GET admin]', err);
      return res.status(503).json({ error: 'No se pudo conectar con Supabase. El proyecto puede estar pausado (plan gratuito). Ve a supabase.com y reactívalo.', detail: err.message });
    }
  }

  // ── POST crear (admin) ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = { ...req.body };
    delete body.portal_token; // lo genera siempre la base de datos

    if (!body.client_name) {
      return res.status(400).json({ error: 'El nombre del cliente es obligatorio' });
    }
    if (!body.slug) {
      body.slug = toSlug(body.client_name);
    }
    body.service_tags = normalizeTags(body.service_tags);

    const r = await fetch(`${SB_URL}/rest/v1/clients`, {
      method: 'POST',
      headers: sbHeaders,
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      // Supabase lanza 23505 si el slug ya existe
      if (err?.code === '23505') {
        return res.status(409).json({ error: `El slug "${body.slug}" ya existe. Usa uno diferente.` });
      }
      return res.status(r.status).json(err);
    }
    const created = await r.json();
    return res.status(201).json(Array.isArray(created) ? created[0] : created);
  }

  // ── PUT actualizar (admin) ─────────────────────────────────────────────────
  if (req.method === 'PUT') {
    if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
    const body = { ...req.body, updated_at: new Date().toISOString() };
    delete body.portal_token;
    delete body.id;
    body.service_tags = normalizeTags(body.service_tags);

    const r = await fetch(`${SB_URL}/rest/v1/clients?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify(body),
    });
    return res.json(await r.json());
  }

  // ── DELETE eliminar (admin) ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
    await fetch(`${SB_URL}/rest/v1/clients?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
