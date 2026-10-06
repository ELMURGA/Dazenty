// api/webhook-lead.js — Punto de entrada para que n8n gestione leads directamente en Dazenty OS
// ==========================================================
// POST /api/webhook-lead
// Header: x-webhook-secret: <N8N_WEBHOOK_SECRET>
//
// Body JSON, dos modos (campo "action"):
//
// 1) action: "create" (o sin "action", por compatibilidad) → crea un lead nuevo.
//    { name?, company?, email?, phone?, source?, value_estimate?, notes?, stage?,
//      website?, city?, sector?, instagram?, whatsapp?, external_id? }
//    Requiere "name" o "company". Si se manda "external_id" (recomendado: el mismo
//    ID que n8n ya genera para la fila de su hoja de cálculo), queda guardado para
//    poder actualizar este mismo lead más adelante sin crear duplicados.
//
// 2) action: "update" → busca un lead ya creado y lo actualiza (fase, notas, datos
//    de contacto…) en vez de crear uno nuevo. Útil para los pasos de "Contactado",
//    "Error de envío", "WhatsApp recuperado", etc. de los flujos de prospección.
//    { action: "update", external_id?, company?, stage?, notes_append?,
//      phone?, email?, website?, instagram?, whatsapp?, lost_reason? }
//    Busca primero por "external_id" (match exacto) y, si no lo encuentra o no se
//    envía, cae a buscar por "company" (match exacto, insensible a mayúsculas) y
//    toma el más reciente. Si tampoco hay coincidencia, crea el lead igualmente
//    (con los datos disponibles) para no perder la información.
//
// Pensado para que los flujos de n8n llamen a esta URL con un nodo "HTTP Request"
// en vez de escribir en Google Sheets. Usa un secreto propio (NO el ADMIN_PASSWORD)
// para limitar el riesgo si se filtra: este endpoint solo puede tocar leads.
// ==========================================================

import { guardWebhook, sbInsert, sbUpdate, sbSelect, logActivity } from '../lib/db.js';

const STAGES = ['nuevo', 'contactada', 'propuesta', 'reunion', 'ganado', 'perdido'];

async function findExistingLead(body) {
  if (body.external_id) {
    const rows = await sbSelect(
      'leads',
      `select=*&external_id=eq.${encodeURIComponent(body.external_id)}&limit=1`
    );
    if (rows.length) return rows[0];
  }
  if (body.company) {
    const rows = await sbSelect(
      'leads',
      `select=*&company=ilike.${encodeURIComponent(body.company)}&order=created_at.desc&limit=1`
    );
    if (rows.length) return rows[0];
  }
  return null;
}

export default async function handler(req, res) {
  if (guardWebhook(req, res)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const body = req.body || {};
    const action = body.action === 'update' ? 'update' : 'create';

    if (action === 'update') {
      const existing = await findExistingLead(body);
      if (existing) {
        const patch = {};
        if (body.stage) {
          if (!STAGES.includes(body.stage)) {
            return res.status(400).json({ error: `stage inválido. Usa: ${STAGES.join(', ')}` });
          }
          patch.stage = body.stage;
        }
        if (body.notes_append) {
          patch.notes = existing.notes ? `${existing.notes}\n${body.notes_append}` : body.notes_append;
        }
        if (body.phone) patch.phone = body.phone;
        if (body.email) patch.email = body.email;
        if (body.website) patch.website = body.website;
        if (body.instagram) patch.instagram = body.instagram;
        if (body.whatsapp) patch.whatsapp = body.whatsapp;
        if (body.lost_reason) patch.lost_reason = body.lost_reason;
        if (body.external_id && !existing.external_id) patch.external_id = body.external_id;

        const updated = await sbUpdate('leads', existing.id, patch);
        if (body.stage) {
          await logActivity('lead', existing.id, 'stage_changed', `Lead "${updated.name}" movido a "${body.stage}" vía n8n`);
        }
        return res.json(updated);
      }
      // Sin coincidencia: seguimos abajo y lo creamos para no perder los datos.
    }

    if (!body.name && !body.company) {
      return res.status(400).json({ error: 'Se requiere "name" o "company"' });
    }
    if (body.stage && !STAGES.includes(body.stage)) {
      return res.status(400).json({ error: `stage inválido. Usa: ${STAGES.join(', ')}` });
    }

    const lead = {
      name: body.name || body.company,
      email: body.email || null,
      phone: body.phone || null,
      company: body.company || null,
      source: body.source || 'n8n',
      value_estimate: body.value_estimate != null ? Number(body.value_estimate) : null,
      notes: body.notes || null,
      website: body.website || null,
      city: body.city || null,
      sector: body.sector || null,
      instagram: body.instagram || null,
      whatsapp: body.whatsapp || null,
      external_id: body.external_id || null,
      stage: body.stage || 'nuevo',
    };
    const created = await sbInsert('leads', lead);
    await logActivity('lead', created.id, 'created', `Nuevo lead vía n8n: ${created.name}`);
    return res.status(201).json(created);
  } catch (err) {
    console.error('[api/webhook-lead]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
