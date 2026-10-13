// api/upload.js — Sube PDFs (propuesta o factura) a Supabase Storage
// ==========================================================
// POST /api/upload
// Body JSON:
//   { clientSlug, docType: "proposal"|"invoice"|"invoice-archive", filename, data: "<base64>" }
// Header: x-admin-password
//
// Devuelve: { publicUrl }
// ==========================================================

import { adminAuthError } from '../lib/db.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '12mb', // Permite PDFs de hasta ~9MB
    },
  },
};

const SB_URL   = process.env.SUPABASE_URL;
const SB_KEY   = process.env.SUPABASE_SERVICE_KEY;
const BUCKET   = 'client-docs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dazenty.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-password');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const authError = await adminAuthError(req);
  if (authError) return res.status(authError.status).json({ error: authError.error });

  const { clientSlug, docType, filename, data } = req.body ?? {};

  // Validaciones
  if (!clientSlug || !docType || !filename || !data) {
    return res.status(400).json({ error: 'Faltan campos: clientSlug, docType, filename, data' });
  }
  if (!['proposal', 'invoice', 'invoice-archive'].includes(docType)) {
    return res.status(400).json({ error: 'docType debe ser "proposal", "invoice" o "invoice-archive"' });
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
  // La extensión no basta: comprobar la cabecera real del archivo
  if (binary.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return res.status(400).json({ error: 'El archivo no es un PDF válido' });
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

  // Se devuelve la URL canónica del objeto como referencia. El bucket es privado:
  // los PDF se abren siempre con URL firmada (api/get-doc.js, api/invoice-pdfs.js)
  const publicUrl = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  return res.json({ publicUrl });
}
