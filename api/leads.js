// api/leads.js — CRUD de leads (CRM pipeline de entrada)
// ==========================================================
// GET    /api/leads                       → lista (filtros: ?stage=)
// POST   /api/leads                       → crear lead
// PUT    /api/leads?id=xxx                → actualizar lead (incl. cambio de stage y seguimiento)
// DELETE /api/leads?id=xxx                → eliminar lead
// POST   /api/leads?id=xxx&action=contact → registrar un contacto (canal, nota, próximo seguimiento)
// POST   /api/leads?id=xxx&action=note    → añadir una nota al historial sin marcar contacto
// POST   /api/leads?id=xxx&action=reply   → marcar/desmarcar "ha respondido, falta contestar" { awaiting: true|false }
// POST   /api/leads?id=xxx&action=convert → convertir en cliente (+ oportunidad) y marcar ganado
// PATCH  /api/leads?action=bulk           → cambiar de fase varios leads { ids, stage }
// Todas requieren x-admin-password.
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity, SB_URL, sbHeaders } from '../lib/db.js';
import { madridNow } from '../lib/push.js';
import {
  CHANNELS, normalizeFollowupFields, suggestNextFollowup, isIsoDate,
} from '../lib/lead-rules.js';

const STAGES = ['nuevo', 'email_no_enviado', 'contactada', 'propuesta', 'reunion', 'ganado', 'perdido'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BULK_MAX = 200;
const NOTE_MAX = 2000;
const CHANNEL_LABELS = { whatsapp: 'WhatsApp', instagram: 'Instagram', email: 'email', llamada: 'llamada', reunion: 'reunión', otro: 'otro canal' };

function toSlug(name) {
  return String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'cliente';
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function loadLead(id) {
  if (!UUID_RE.test(String(id))) throw httpError(400, 'id inválido');
  const [lead] = await sbSelect('leads', `id=eq.${id}&select=*`);
  if (!lead) throw httpError(404, 'Lead no encontrado');
  return lead;
}

// Registra un contacto: guarda fecha, canal y próximo seguimiento, y lo deja en el historial
async function registerContact(id, body) {
  const lead = await loadLead(id);
  const today = madridNow().date;
  const note = String(body.note || '').trim().slice(0, NOTE_MAX);
  const channel = body.channel || lead.channel || null;
  if (channel && !CHANNELS.includes(channel)) throw httpError(400, `channel inválido. Usa: ${CHANNELS.join(', ')}`);
  if (body.next_followup_at && !isIsoDate(body.next_followup_at)) throw httpError(400, 'next_followup_at debe tener el formato AAAA-MM-DD');

  // Un lead que aún no se había contactado pasa a "contactada"; el resto conserva su fase
  const stage = ['nuevo', 'email_no_enviado'].includes(lead.stage) ? 'contactada' : lead.stage;
  const patch = {
    last_contact_at: new Date().toISOString(),
    awaiting_reply: false, // ya le hemos contestado
    channel,
    // null/'' = sin próximo seguimiento; si no se envía el campo, se propone uno según la fase
    next_followup_at: body.next_followup_at === undefined ? suggestNextFollowup(stage, today) : (body.next_followup_at || null),
  };
  if (stage !== lead.stage) patch.stage = stage;
  const updated = await sbUpdate('leads', id, patch);
  const via = channel ? ` por ${CHANNEL_LABELS[channel]}` : '';
  await logActivity('lead', id, 'contact',
    `Contacto${via} con "${lead.name}"${note ? `: ${note}` : ''}`,
    { channel, note: note || null, next_followup_at: patch.next_followup_at, stage: updated.stage });
  return updated;
}

// Marca (o desmarca) que el lead ha respondido y falta contestarle
async function setAwaitingReply(id, body) {
  const lead = await loadLead(id);
  const awaiting = body.awaiting !== false;
  const patch = awaiting
    ? { awaiting_reply: true, replied_at: new Date().toISOString() }
    : { awaiting_reply: false };
  const updated = await sbUpdate('leads', id, patch);
  await logActivity('lead', id, 'reply',
    awaiting ? `"${lead.name}" ha respondido: falta contestar` : `Respuesta a "${lead.name}" marcada como atendida`,
    { awaiting });
  return updated;
}

async function convertToClient(id) {
  const lead = await loadLead(id);
  if (lead.converted_client_id) throw httpError(409, 'Este lead ya está convertido en cliente');
  const clientName = lead.company || lead.name;

  let client = null;
  const base = toSlug(clientName);
  for (let attempt = 0; attempt < 6 && !client; attempt++) {
    try {
      client = await sbInsert('clients', {
        client_name: clientName,
        company_name: lead.company || null,
        client_contact_name: lead.name,
        client_contact_email: lead.email || null,
        slug: attempt === 0 ? base : `${base}-${attempt + 1}`,
        status: 'active',
        service_tags: [],
      });
    } catch (err) {
      // 23505 = el slug ya existe: se reintenta con un sufijo
      if (err.body?.code !== '23505') throw err;
    }
  }
  if (!client) throw httpError(409, 'No se pudo generar un identificador único para el cliente');

  let opportunity = null;
  try {
    opportunity = await sbInsert('opportunities', {
      client_id: client.id,
      lead_id: lead.id,
      title: `Proyecto ${clientName}`,
      value: lead.value_estimate || null,
      status: 'abierta',
      probability: 70,
    });
  } catch (err) {
    console.error('[api/leads convert] oportunidad:', err); // el cliente ya existe: no se deshace
  }

  const updated = await sbUpdate('leads', id, {
    stage: 'ganado', converted_client_id: client.id, next_followup_at: null,
  });
  await logActivity('lead', id, 'converted', `Lead "${lead.name}" convertido en cliente "${client.client_name}"`,
    { client_id: client.id, opportunity_id: opportunity?.id || null });
  return { lead: updated, client, opportunity };
}

async function bulkStage(body) {
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
  if (!ids.length) throw httpError(400, 'Selecciona al menos un lead');
  if (ids.length > BULK_MAX) throw httpError(400, `Máximo ${BULK_MAX} leads por operación`);
  if (ids.some(i => !UUID_RE.test(String(i)))) throw httpError(400, 'ids inválidos');
  if (!STAGES.includes(body.stage)) throw httpError(400, `stage inválido. Usa: ${STAGES.join(', ')}`);

  const patch = { stage: body.stage };
  if (['ganado', 'perdido'].includes(body.stage)) patch.next_followup_at = null;
  const r = await fetch(`${SB_URL}/rest/v1/leads?id=in.(${ids.join(',')})`, {
    method: 'PATCH', headers: sbHeaders, body: JSON.stringify(patch),
  });
  if (!r.ok) throw httpError(502, `Supabase leads PATCH ${r.status}`);
  const rows = await r.json();
  await logActivity('lead', null, 'bulk_stage', `${rows.length} leads movidos a "${body.stage}"`, { ids, stage: body.stage });
  return { updated: rows.length };
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { id, stage, action } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc,id.desc';
      if (stage) params += `&stage=eq.${encodeURIComponent(stage)}`;
      // Supabase devuelve como máximo 1000 filas por petición: se pagina hasta traerlas todas
      const PAGE = 1000;
      const all = [];
      for (let offset = 0; offset < 100000; offset += PAGE) {
        const rows = await sbSelect('leads', `${params}&limit=${PAGE}&offset=${offset}`);
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      return res.json(all);
    }

    if (req.method === 'POST' && action === 'contact') return res.json(await registerContact(id, req.body || {}));

    if (req.method === 'POST' && action === 'note') {
      const lead = await loadLead(id);
      const note = String(req.body?.note || '').trim().slice(0, NOTE_MAX);
      if (!note) return res.status(400).json({ error: 'La nota está vacía' });
      await logActivity('lead', id, 'note', `Nota sobre "${lead.name}": ${note}`, { note });
      return res.json({ ok: true });
    }

    if (req.method === 'POST' && action === 'reply') return res.json(await setAwaitingReply(id, req.body || {}));

    if (req.method === 'POST' && action === 'convert') return res.status(201).json(await convertToClient(id));

    if (req.method === 'PATCH' && action === 'bulk') return res.json(await bulkStage(req.body || {}));

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.name) return res.status(400).json({ error: 'El nombre del lead es obligatorio' });
      if (body.stage && !STAGES.includes(body.stage)) {
        return res.status(400).json({ error: `stage inválido. Usa: ${STAGES.join(', ')}` });
      }
      const f = normalizeFollowupFields(body);
      if (f.error) return res.status(400).json({ error: f.error });
      Object.assign(body, f.fields);
      const created = await sbInsert('leads', body);
      await logActivity('lead', created.id, 'created', `Nuevo lead: ${created.name}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const body = { ...req.body };
      if (body.stage && !STAGES.includes(body.stage)) {
        return res.status(400).json({ error: `stage inválido. Usa: ${STAGES.join(', ')}` });
      }
      const f = normalizeFollowupFields(body);
      if (f.error) return res.status(400).json({ error: f.error });
      Object.assign(body, f.fields);
      // last_contact_at solo lo escribe "registrar contacto"; el panel no lo toca a mano
      delete body.last_contact_at;
      delete body.replied_at; // lo escribe la acción "reply"
      if (['ganado', 'perdido'].includes(body.stage) && body.next_followup_at === undefined) body.next_followup_at = null;
      const updated = await sbUpdate('leads', id, body);
      if (body.stage) {
        await logActivity('lead', id, 'stage_changed', `Lead "${updated.name}" movido a "${body.stage}"`);
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      await sbDelete('leads', id);
      await logActivity('lead', id, 'deleted', 'Lead eliminado');
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/leads]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
