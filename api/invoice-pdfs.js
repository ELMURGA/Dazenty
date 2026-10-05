// api/invoice-pdfs.js — Archivo de facturas en PDF organizadas por cliente
// ==========================================================
// GET    /api/invoice-pdfs                → lista (filtro opcional ?client_id=)
// POST   /api/invoice-pdfs                 → registra un PDF ya subido a Storage
//        body: { client_id, file_name, file_url, label?, amount?, issue_date? }
// DELETE /api/invoice-pdfs?id=xxx          → elimina el registro (no borra el archivo de Storage)
// Todas requieren x-admin-password.
// ==========================================================

import { guard, sbSelect, sbInsert, sbDelete, logActivity } from '../lib/db.js';

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, client_id } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc';
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('invoice_pdfs', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.client_id) return res.status(400).json({ error: 'client_id es obligatorio' });
      if (!body.file_name || !body.file_url) {
        return res.status(400).json({ error: 'file_name y file_url son obligatorios' });
      }
      const created = await sbInsert('invoice_pdfs', body);
      await logActivity('invoice_pdf', created.id, 'created', `Factura PDF subida: ${created.file_name}`);
      return res.status(201).json(created);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('invoice_pdfs', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/invoice-pdfs]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
