// api/documents.js — Metadatos de documentos por cliente/proyecto
// (el archivo en sí se sube con /api/upload.js, reutilizando el bucket client-docs;
// este endpoint solo registra/lista/elimina la referencia en la tabla documents)
// ==========================================================
// GET    /api/documents?client_id=xxx    → lista de documentos de un cliente
// POST   /api/documents                   → registrar documento {client_id, name, doc_type, file_url, file_size}
// DELETE /api/documents?id=xxx            → eliminar referencia
// ==========================================================

import { guard, sbSelect, sbInsert, sbDelete, logActivity } from '../lib/db.js';

const DOC_TYPES = ['propuesta', 'factura', 'contrato', 'otro'];

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id, client_id, project_id } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=uploaded_at.desc';
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      if (project_id) params += `&project_id=eq.${encodeURIComponent(project_id)}`;
      return res.json(await sbSelect('documents', params));
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.client_id) return res.status(400).json({ error: 'client_id es obligatorio' });
      if (!body.name) return res.status(400).json({ error: 'El nombre del documento es obligatorio' });
      if (!body.file_url) return res.status(400).json({ error: 'file_url es obligatorio' });
      if (body.doc_type && !DOC_TYPES.includes(body.doc_type)) {
        return res.status(400).json({ error: `doc_type inválido. Usa: ${DOC_TYPES.join(', ')}` });
      }
      const created = await sbInsert('documents', body);
      await logActivity('document', created.id, 'created', `Documento subido: ${created.name}`);
      return res.status(201).json(created);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('documents', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/documents]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
