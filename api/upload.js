// api/upload.js — Sube PDFs (propuesta o factura) a Supabase Storage
// ==========================================================
// POST /api/upload
// Body JSON:
//   { clientSlug, docType: "proposal"|"invoice", filename, data: "<base64>" }
// Header: x-admin-password
//
// Devuelve: { publicUrl }
// ==========================================================

import { timingSafeEqual } from 'crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb', // Permite PDFs de hasta ~9MB
    },
  },
};

const SB_URL   = process.env.SUPABASE_URL;
const SB_KEY   = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PW = process.env.ADMIN_PASSWORD;
const BUCKET   = 'client-docs';

function isAdmin(req) {
  const pass     = String(req.headers['x-admin-password'] || '');
  const expected = String(ADMIN_PW || '');
  if (!pass || !expected) return false;
  const maxLen = Math.max(pass.length, expected.length);
  const a = Buffer.alloc(maxLen);
  const b = Buffer.alloc(maxLen);
  a.write(pass);
  b.write(expected);
  return timingSafeEqual(a, b) && pass.length === expected.length;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  if (!isAdmin(req)) return res.status(401).json({ error: 'No autorizado' });

  const { clientSlug, docType, filename, data } = req.body ?? {};

  // Validaciones
  if (!clientSlug || !docType || !filename || !data) {
    return res.status(400).json({ error: 'Faltan campos: clientSlug, docType, filename, data' });
  }
  if (!['proposal', 'invoice'].includes(docType)) {
    return res.status(400).json({ error: 'docType debe ser "proposal" o "invoice"' });
  }
  // Solo permitir PDFs
  const ext = filename.split('.').pop().toLowerCase();
  if (ext !== 'pdf') {
    return res.status(400).json({ error: 'Solo se permiten archivos PDF' });
  }
  // Validar que clientSlug no tenga caracteres peligrosos
  if (!/^[a-z0-9-]+$/.test(clientSlug)) {
    return res.status(400).json({ error: 'clientSlug inválido' });
  }

  const path = `${clientSlug}/${docType}-${Date.now()}.pdf`;

  let binary;
  try {
    binary = Buffer.from(data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Datos base64 inválidos' });
  }

  // Subir a Supabase Storage
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: binary,
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    console.error('[upload] Supabase Storage error:', err);
    return res.status(502).json({ error: 'Error al subir el archivo a Storage' });
  }

  // Devolver la URL pública completa (bucket público)
  const publicUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return res.json({ publicUrl });
}
