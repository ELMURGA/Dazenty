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

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-admin-password',
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

// Middleware común: CORS + OPTIONS + auth admin. Devuelve true si la petición
// ya quedó resuelta (error/OPTIONS) y el handler debe retornar inmediatamente.
export function guard(req, res) {
  applyCors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  if (!SB_URL || !SB_KEY) {
    res.status(503).json({ error: 'SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas' });
    return true;
  }
  const adminCheck = isAdmin(req);
  if (adminCheck === 'no_env') {
    res.status(503).json({ error: 'ADMIN_PASSWORD no configurada en Vercel' });
    return true;
  }
  if (!adminCheck) {
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
    .replace(/"/g, '&quot;');
}
