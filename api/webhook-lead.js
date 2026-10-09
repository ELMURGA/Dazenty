// api/webhook-lead.js — Punto de entrada para que n8n gestione leads directamente en Dazenty OS
// ==========================================================
// POST /api/webhook-lead
// Header: x-webhook-secret: <N8N_WEBHOOK_SECRET>
//
// Body JSON, varios modos (campo "action"):
//
// 1) action: "create" (o sin "action", por compatibilidad) → crea un lead nuevo.
//    { name?, company?, email?, phone?, source?, value_estimate?, notes?, stage?,
//      website?, city?, sector?, instagram?, whatsapp?, external_id?,
//      email_asunto?, email_cuerpo?, whatsapp_msg?, instagram_msg? }
//    Requiere "name" o "company". Si se manda "external_id" (recomendado: el mismo
//    ID que n8n ya genera para la fila de su hoja de cálculo), queda guardado para
//    poder actualizar este mismo lead más adelante sin crear duplicados.
//
// 2) action: "update" → busca un lead ya creado y lo actualiza (fase, notas, datos
//    de contacto…) en vez de crear uno nuevo. Útil para los pasos de "Contactado",
//    "Error de envío", "WhatsApp recuperado", etc. de los flujos de prospección.
//    { action: "update", external_id?, company?, stage?, notes_append?,
//      phone?, email?, website?, instagram?, whatsapp?, lost_reason?,
//      email_asunto?, email_cuerpo?, whatsapp_msg?, instagram_msg?,
//      mark_whatsapp_contacted? }
//    Busca primero por "external_id" (match exacto) y, si no lo encuentra o no se
//    envía, cae a buscar por "company" (match exacto, insensible a mayúsculas) y
//    toma el más reciente. Si tampoco hay coincidencia, crea el lead igualmente
//    (con los datos disponibles) para no perder la información.
//    "mark_whatsapp_contacted: true" guarda la fecha/hora actual en
//    whatsapp_contacted_at (reemplaza a la columna "Contactado WhatsApp" de Sheets).
//
// 3) action: "check_duplicate" → { company } → { exists, lead } para que los
//    flujos de prospección automática no vuelvan a procesar el mismo negocio.
//
// 4) action: "find_by_company" → { query } → busca de forma difusa (ignora
//    acentos/mayúsculas, admite coincidencia parcial) para el comando de
//    Telegram "wa <empresa>". Devuelve { encontrado, buscado, empresa, id,
//    whatsapp, ya_contactado } o, si no hay match, { encontrado: false,
//    sugerencias: [...] } con los últimos nombres de empresa conocidos.
//
// 5) action: "list_pending_email" → { limit? } → leads con email pero que
//    todavía no pasaron a "contactada" (reemplaza la lectura completa de
//    Sheets del flujo "Reenviar emails pendientes").
//
// 6) action: "list_missing_whatsapp" → { limit? } → leads con web conocida
//    pero sin WhatsApp y que no se marcaron como "contactado por WhatsApp"
//    (reemplaza la lectura completa de Sheets del flujo "Recuperar WhatsApp").
//
// Pensado para que los flujos de n8n llamen a esta URL con un nodo "HTTP Request"
// en vez de escribir en Google Sheets. Usa un secreto propio (NO el ADMIN_PASSWORD)
// para limitar el riesgo si se filtra: este endpoint solo puede tocar leads.
// ==========================================================

import { guardWebhook, sbInsert, sbUpdate, sbSelect, logActivity } from '../lib/db.js';

const STAGES = ['nuevo', 'contactada', 'propuesta', 'reunion', 'ganado', 'perdido'];

const normalizar = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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

// Búsqueda difusa por nombre de empresa (ignora acentos/mayúsculas, admite
// coincidencia parcial en cualquier dirección), igual que hacía antes el
// código de n8n directamente sobre las filas de Sheets.
async function buscarPorEmpresaDifuso(query) {
  const objetivo = normalizar(query);
  const candidatos = await sbSelect(
    'leads',
    'select=id,company,whatsapp,whatsapp_contacted_at,external_id&company=not.is.null&order=created_at.desc&limit=300'
  );
  let match = candidatos.find((f) => normalizar(f.company) === objetivo);
  if (!match) {
    match = candidatos.find(
      (f) => normalizar(f.company).includes(objetivo) || objetivo.includes(normalizar(f.company))
    );
  }
  if (!match) {
    return {
      encontrado: false,
      buscado: query,
      sugerencias: candidatos.slice(0, 15).map((f) => f.company).join(', '),
    };
  }
  return {
    encontrado: true,
    buscado: query,
    empresa: match.company,
    id: match.id,
    whatsapp: match.whatsapp || '',
    ya_contactado: !!match.whatsapp_contacted_at,
  };
}

export default async function handler(req, res) {
  if (guardWebhook(req, res)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const body = req.body || {};
    const action = body.action || 'create';

    if (action === 'check_duplicate') {
      if (!body.company) return res.status(400).json({ error: 'Se requiere "company"' });
      const rows = await sbSelect(
        'leads',
        `select=id,company,stage,created_at&company=ilike.${encodeURIComponent(body.company)}&limit=1`
      );
      return res.json({ exists: rows.length > 0, lead: rows[0] || null });
    }

    if (action === 'find_by_company') {
      if (!body.query) return res.status(400).json({ error: 'Se requiere "query"' });
      return res.json(await buscarPorEmpresaDifuso(body.query));
    }

    if (action === 'list_pending_email') {
      const limit = Math.min(Number(body.limit) || 20, 100);
      const rows = await sbSelect(
        'leads',
        `select=id,company,email,email_asunto,email_cuerpo,notes,city,sector,website&stage=eq.nuevo&email=not.is.null&email_cuerpo=not.is.null&order=created_at.asc&limit=${limit}`
      );
      return res.json({ leads: rows });
    }

    if (action === 'list_missing_whatsapp') {
      const limit = Math.min(Number(body.limit) || 20, 100);
      const rows = await sbSelect(
        'leads',
        `select=id,company,email,phone,website,whatsapp_msg,sector,city,notes&whatsapp=is.null&website=not.is.null&whatsapp_contacted_at=is.null&order=created_at.asc&limit=${limit}`
      );
      return res.json({ leads: rows });
    }

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
        if (body.email_asunto) patch.email_asunto = body.email_asunto;
        if (body.email_cuerpo) patch.email_cuerpo = body.email_cuerpo;
        if (body.whatsapp_msg) patch.whatsapp_msg = body.whatsapp_msg;
        if (body.instagram_msg) patch.instagram_msg = body.instagram_msg;
        if (body.mark_whatsapp_contacted) patch.whatsapp_contacted_at = new Date().toISOString();
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
      email_asunto: body.email_asunto || null,
      email_cuerpo: body.email_cuerpo || null,
      whatsapp_msg: body.whatsapp_msg || null,
      instagram_msg: body.instagram_msg || null,
    };
    const created = await sbInsert('leads', lead);
    await logActivity('lead', created.id, 'created', `Nuevo lead vía n8n: ${created.name}`);
    return res.status(201).json(created);
  } catch (err) {
    console.error('[api/webhook-lead]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
