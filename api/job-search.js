// api/job-search.js — Búsqueda de trabajo (Job Agent con n8n)
// ==========================================================
// Lee las tablas ja_* que rellenan los flujos de n8n (Job Agent).
// Son independientes del CRM: no toca leads, clients, activities, etc.
//
// GET /api/job-search                → { profile, applications }
// PUT /api/job-search?id=xxx         → actualizar candidatura (status, notes, cover_letter)
// Todas requieren x-admin-password.
// ==========================================================

import { guard, sbSelect, sbUpdate } from '../lib/db.js';

const STATUSES = [
  'nueva', 'descartada', 'preparada', 'pendiente_ok', 'requiere_accion',
  'aplicada', 'vista', 'prueba', 'entrevista', 'oferta', 'rechazada',
];
const EDITABLE = ['status', 'notes', 'cover_letter'];

export default async function handler(req, res) {
  if (guard(req, res)) return;
  const { id } = req.query;

  try {
    if (req.method === 'GET') {
      const [profiles, applications] = await Promise.all([
        sbSelect('ja_profile', 'slug=eq.principal&select=analysis,preferences,form_answers,portal_config,updated_at'),
        sbSelect('ja_applications', 'select=*,job:ja_jobs(id,portal,url,title,company,location,remote_type,salary,language,posted_at,created_at)&order=score.desc.nullslast,created_at.desc&limit=500'),
      ]);
      return res.json({ profile: profiles[0] || null, applications });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const body = {};
      for (const k of EDITABLE) if (k in (req.body || {})) body[k] = req.body[k];
      if (!Object.keys(body).length) return res.status(400).json({ error: `Nada que actualizar. Campos: ${EDITABLE.join(', ')}` });
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      if (body.status === 'aplicada') {
        const [current] = await sbSelect('ja_applications', `id=eq.${encodeURIComponent(id)}&select=applied_at`);
        if (current && !current.applied_at) body.applied_at = new Date().toISOString();
      }
      return res.json(await sbUpdate('ja_applications', id, body));
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/job-search]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
