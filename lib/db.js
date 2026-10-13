// lib/db.js — Helpers compartidos para todos los endpoints de Dazenty OS
// ==========================================================
// NO es un endpoint (vive fuera de /api), solo se importa desde los
// handlers de /api/*.js. Centraliza: auth admin, CORS, headers Supabase,
// y el registro automático de actividad (feed de "Actividad").
// ==========================================================

import { timingSafeEqual } from 'crypto';

export const SB_URL = process.env.SUPABASE_URL;
export const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PW = process.env.ADMIN_PASSWORD;

// El panel y el portal se sirven desde el mismo origen: no hace falta abrir CORS a terceros
export const CORS = {
  'Access-Control-Allow-Origin': 'https://dazenty.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password, x-webhook-secret',
};

export function applyCors(res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
}

export const sbHeaders = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

export const sbReadHeaders = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
};

// Comparación en tiempo constante — evita timing attacks (igual que clients.js)
export function isAdmin(req) {
  const pass = String(req.headers['x-admin-password'] || '');
  const expected = String(ADMIN_PW || '');
  if (!expected) return 'no_env';
  if (!pass) return false;
  const maxLen = Math.max(pass.length, expected.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  a.write(pass);
  b.write(expected);
  return timingSafeEqual(a, b) && pass.length === expected.length;
}

// Comparación en tiempo constante de dos secretos (tokens, contraseñas)
export function safeEqual(given, expected) {
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(String(expected || ''));
  if (!a.length || !b.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// IP del cliente tal como la entrega el proxy de Vercel
export function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '');
  return forwarded.split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
}

async function rateLimitRpc(fn, key, max, windowSeconds) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: String(key).slice(0, 300), p_max: max, p_window_seconds: windowSeconds }),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status}`);
  return r.json();
}

// Contabiliza una petición. Devuelve false cuando se supera el máximo en la ventana.
// Si el limitador falla no bloquea: un fallo suyo no debe tumbar el endpoint.
export async function withinRateLimit(key, max, windowSeconds) {
  try {
    return (await rateLimitRpc('check_rate_limit', key, max, windowSeconds)) !== false;
  } catch (err) {
    console.error('[rate-limit]', err);
    return true;
  }
}

// Máximo de contraseñas de admin fallidas por IP antes de bloquear (ventana de 15 min)
const ADMIN_MAX_FAILS = 10;
const ADMIN_FAIL_WINDOW = 900;

// Autenticación admin con bloqueo por fuerza bruta.
// Devuelve null si la petición está autorizada, o { status, error } si no.
export async function adminAuthError(req) {
  if (!String(ADMIN_PW || '')) return { status: 503, error: 'ADMIN_PASSWORD no configurada en Vercel' };
  const key = `admin-fail:${clientIp(req)}`;
  try {
    if ((await rateLimitRpc('rate_limit_exceeded', key, ADMIN_MAX_FAILS, ADMIN_FAIL_WINDOW)) === true) {
      return { status: 429, error: 'Demasiados intentos. Espera unos minutos.' };
    }
  } catch (err) {
    console.error('[rate-limit]', err);
  }
  if (isAdmin(req) === true) return null;
  if (req.headers['x-admin-password']) await withinRateLimit(key, ADMIN_MAX_FAILS, ADMIN_FAIL_WINDOW);
  return { status: 401, error: 'No autorizado' };
}

// Middleware común: CORS + OPTIONS + auth admin. Devuelve true si la petición
// ya quedó resuelta (error/OPTIONS) y el handler debe retornar inmediatamente.
export async function guard(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  if (!SB_URL || !SB_KEY) {
    res.status(503).json({ error: 'SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas' });
    return true;
  }
  const authError = await adminAuthError(req);
  if (authError) {
    res.status(authError.status).json({ error: authError.error });
    return true;
  }
  return false;
}

// Carga un cliente activo del portal comprobando su token secreto.
// Devuelve { client } o { status, error }. No distingue "no existe" de "token incorrecto".
export async function loadPortalClient(slug, token, select = '*') {
  if (!slug || !/^[a-z0-9-]+$/.test(String(slug)) || !token) {
    return { status: 404, error: 'Portal no encontrado' };
  }
  const fields = select === '*'
    ? '*'
    : [...new Set([...select.split(','), 'slug', 'portal_token', 'status'])].join(',');
  const r = await fetch(
    `${SB_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=${fields}&limit=1`,
    { headers: sbReadHeaders }
  );
  if (!r.ok) return { status: 500, error: 'Error al consultar la base de datos' };
  const client = (await r.json())?.[0];
  if (!client || !safeEqual(token, client.portal_token)) {
    return { status: 404, error: 'Portal no encontrado' };
  }
  if (client.status !== 'active') {
    return { status: 403, error: 'Este portal no está disponible en este momento' };
  }
  return { client };
}

// URL firmada de corta duración para un archivo del bucket privado de documentos
export async function signedDocUrl(path, expiresIn = 300) {
  const base = String(SB_URL || '').replace(/\/$/, '');
  const r = await fetch(`${base}/storage/v1/object/sign/client-docs/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn }),
  });
  if (!r.ok) return null;
  const data = await r.json();
  const signed = data.signedURL || data.signedUrl;
  return signed ? `${base}/storage/v1${signed}` : null;
}

// Extrae la ruta dentro del bucket a partir de una URL pública/firmada o de una ruta relativa
export function docPath(value) {
  if (!value) return null;
  for (const marker of ['/object/public/client-docs/', '/object/sign/client-docs/']) {
    if (value.includes(marker)) return decodeURIComponent(value.split(marker)[1].split('?')[0].split('#')[0]);
  }
  if (!value.startsWith('http')) return value.replace(/^\/+/, '');
  return null;
}

// Igual que isAdmin() pero para el secreto dedicado de webhooks (p.ej. n8n),
// evitando reutilizar el ADMIN_PASSWORD fuera del navegador.
const N8N_SECRET = process.env.N8N_WEBHOOK_SECRET;
export function isN8nWebhook(req) {
  const pass = String(req.headers['x-webhook-secret'] || '');
  const expected = String(N8N_SECRET || '');
  if (!expected) return 'no_env';
  if (!pass) return false;
  const maxLen = Math.max(pass.length, expected.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  a.write(pass);
  b.write(expected);
  return timingSafeEqual(a, b) && pass.length === expected.length;
}

// Middleware para endpoints de webhooks externos (n8n): CORS + OPTIONS + secreto dedicado.
// No comprueba ADMIN_PASSWORD ni requiere Supabase configurado hasta usarlo el handler.
export function guardWebhook(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  if (!SB_URL || !SB_KEY) {
    res.status(503).json({ error: 'SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas' });
    return true;
  }
  const check = isN8nWebhook(req);
  if (check === 'no_env') {
    res.status(503).json({ error: 'N8N_WEBHOOK_SECRET no configurado en Vercel' });
    return true;
  }
  if (!check) {
    res.status(401).json({ error: 'No autorizado' });
    return true;
  }
  return false;
}

// Registra una entrada en el feed de actividad. No bloqueante: si falla,
// solo se loguea en consola (nunca debe romper la operación principal).
export async function logActivity(entity_type, entity_id, action, description, metadata = null) {
  try {
    await fetch(`${SB_URL}/rest/v1/activities`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ entity_type, entity_id, action, description, metadata }),
    });
  } catch (err) {
    console.error('[logActivity]', err);
  }
}

// Helper genérico para listar filas de una tabla con query params PostgREST
export async function sbSelect(table, params = '') {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, { headers: sbReadHeaders });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Supabase ${table} GET ${r.status}: ${detail.slice(0, 300)}`);
  }
  return r.json();
}

export async function sbInsert(table, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const e = new Error(err?.message || `Supabase ${table} POST ${r.status}`);
    e.status = r.status;
    e.body = err;
    throw e;
  }
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function sbUpdate(table, id, body) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: sbHeaders,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    const e = new Error(err?.message || `Supabase ${table} PATCH ${r.status}`);
    e.status = r.status;
    e.body = err;
    throw e;
  }
  const data = await r.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function sbDelete(table, id) {
  const r = await fetch(`${SB_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: sbReadHeaders,
  });
  if (!r.ok) {
    const detail = await r.text();
    throw new Error(`Supabase ${table} DELETE ${r.status}: ${detail.slice(0, 300)}`);
  }
}

export function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
