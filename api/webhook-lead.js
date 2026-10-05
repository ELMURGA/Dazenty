// api/webhook-lead.js — Punto de entrada para que n8n cree leads directamente en Dazenty OS
// ==========================================================
// POST /api/webhook-lead
// Header: x-webhook-secret: <N8N_WEBHOOK_SECRET>
// Body JSON: { name, email?, phone?, company?, source?, value_estimate?, notes? }
//
// Pensado para que un flujo de n8n llame a esta URL con un nodo "HTTP Request"
// cada vez que su IA detecte/cualifique un lead nuevo, en vez de escribirlo en Excel.
// Usa un secreto propio (NO el ADMIN_PASSWORD) para limitar el riesgo si se filtra:
// este endpoint solo puede crear leads, nada más.
// ==========================================================

import { guardWebhook, sbInsert, logActivity } from '../lib/db.js';

export default async function handler(req, res) {
  if (guardWebhook(req, res)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const body = req.body || {};
    if (!body.name) return res.status(400).json({ error: 'El campo "name" es obligatorio' });

    const lead = {
      name: body.name,
      email: body.email || null,
      phone: body.phone || null,
      company: body.company || null,
      source: body.source || 'n8n',
      value_estimate: body.value_estimate != null ? Number(body.value_estimate) : null,
      notes: body.notes || null,
      stage: 'nuevo',
    };
    const created = await sbInsert('leads', lead);
    await logActivity('lead', created.id, 'created', `Nuevo lead vía n8n: ${created.name}`);
    return res.status(201).json(created);
  } catch (err) {
    console.error('[api/webhook-lead]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
