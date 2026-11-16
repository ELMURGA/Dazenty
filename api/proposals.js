// api/proposals.js — Estado de las propuestas enviadas a leads y clientes
// ==========================================================
// GET    /api/proposals                 → lista (filtros: ?status=, ?lead_id=, ?client_id=, ?open=1)
// POST   /api/proposals                 → crear { lead_id | client_id, title, amount?, sent_at?, channel?, url?, ... }
// PUT    /api/proposals?id=xxx          → editar (incluido el estado: enviada/vista/aceptada/rechazada/caducada)
// DELETE /api/proposals?id=xxx          → eliminar
// POST   /api/proposals?action=register → lo usa el comando /presupuesto al crear la propuesta en Canva:
//        { client_name, title?, amount?, url?, notes? } busca el lead o cliente por nombre, lo enlaza y
//        guarda la propuesta (si ya hay una abierta con el mismo título, la actualiza). Con varios
//        candidatos responde 409 con la lista; sin ninguno crea el lead.
// Todas requieren x-admin-password. Las abiertas (enviada/vista) sin movimiento en 5 días
// salen en "Hoy toca contactar" (lib/proposal-rules.js).
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';
import { madridNow } from '../lib/push.js';
import { normalizeProposal, OPEN_PROPOSAL_STATUSES } from '../lib/proposal-rules.js';
import { pickOwner, normalizeName } from '../lib/proposal-owner.js';
import { sanitizeSearch } from '../lib/search.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EARLY_STAGES = ['nuevo', 'email_no_enviado', 'contactada'];
const httpError = (status, message) => Object.assign(new Error(message), { status });
const STATUS_LABELS = { enviada: 'enviada', vista: 'vista', aceptada: 'aceptada', rechazada: 'rechazada', caducada: 'caducada' };

async function loadProposal(id) {
  if (!UUID_RE.test(String(id))) throw httpError(400, 'id inválido');
  const [row] = await sbSelect('proposals', `id=eq.${id}&select=*`);
  if (!row) throw httpError(404, 'Propuesta no encontrada');
  return row;
}


// Crea (o actualiza) la propuesta de un cliente a partir del nombre que sale en la propuesta de Canva
async function registerProposal(body) {
  const clientName = String(body.client_name || '').trim();
  if (clientName.length < 2) throw httpError(400, 'client_name es obligatorio');
  const title = String(body.title || `Propuesta ${clientName}`).trim().slice(0, 200);

  // Se valida todo antes de crear nada (un enlace o importe inválido no debe dejar un lead suelto)
  const check = normalizeProposal({ title, lead_id: 'x', amount: body.amount ?? null, url: body.url || null });
  if (check.error) throw httpError(400, check.error);

  // Candidatos: se buscan con la primera palabra con peso para no traer la tabla entera
  const word = sanitizeSearch(normalizeName(clientName).split(' ').sort((a, b) => b.length - a.length)[0] || clientName);
  const filter = encodeURIComponent(`(company.ilike.*${word}*,name.ilike.*${word}*)`);
  const cfilter = encodeURIComponent(`(client_name.ilike.*${word}*,company_name.ilike.*${word}*)`);
  const [leads, clients] = await Promise.all([
    sbSelect('leads', `select=id,name,company,stage,created_at&or=${filter}&limit=50`),
    sbSelect('clients', `select=id,client_name,company_name,created_at&or=${cfilter}&limit=50`),
  ]);
  const owner = pickOwner(clientName, leads, clients);
  if (owner.type === 'ambiguous') {
    const err = httpError(409, `Hay varias coincidencias para "${clientName}": indica cuál es`);
    err.candidates = owner.candidates;
    throw err;
  }

  let leadId = null;
  let clientId = null;
  let createdLead = false;
  if (owner.type === 'lead') leadId = owner.row.id;
  else if (owner.type === 'client') clientId = owner.row.id;
  else {
    const lead = await sbInsert('leads', { name: clientName, company: clientName, source: 'presupuesto', stage: 'propuesta' });
    leadId = lead.id;
    createdLead = true;
    await logActivity('lead', lead.id, 'created', `Nuevo lead desde /presupuesto: ${clientName}`);
  }

  const n = normalizeProposal({
    title, lead_id: leadId, client_id: clientId, amount: body.amount ?? null,
    url: body.url || null, notes: body.notes || null,
  });
  if (n.error) throw httpError(400, n.error);

  const ownerCol = leadId ? 'lead_id' : 'client_id';
  const ownerId = leadId || clientId;
  const open = await sbSelect('proposals', `${ownerCol}=eq.${ownerId}&status=in.(${OPEN_PROPOSAL_STATUSES.join(',')})&select=*`);
  const same = open.find(p => normalizeName(p.title) === normalizeName(title));
  if (same) {
    const patch = {};
    for (const k of ['amount', 'url', 'notes']) if (n.fields[k] != null) patch[k] = n.fields[k];
    const updated = await sbUpdate('proposals', same.id, patch);
    if (leadId) await logActivity('lead', leadId, 'proposal', `Propuesta "${title}" actualizada desde /presupuesto`, { proposal_id: same.id });
    return { status: 200, body: { proposal: updated, updated: true, owner: ownerCol === 'lead_id' ? 'lead' : 'client', created_lead: false } };
  }

  const created = await sbInsert('proposals', { status: 'enviada', sent_at: madridNow().date, ...n.fields });
  if (leadId) {
    const [lead] = await sbSelect('leads', `id=eq.${leadId}&select=id,name,stage`);
    if (lead && EARLY_STAGES.includes(lead.stage)) await sbUpdate('leads', lead.id, { stage: 'propuesta' });
    await logActivity('lead', leadId, 'proposal',
      `Propuesta creada en Canva${lead ? ` para "${lead.name}"` : ''}: ${created.title}${created.amount ? ` (${created.amount}€)` : ''}`,
      { proposal_id: created.id });
  }
  return { status: 201, body: { proposal: created, updated: false, owner: ownerCol === 'lead_id' ? 'lead' : 'client', created_lead: createdLead } };
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { id, status, lead_id, client_id, open, action } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc,id.desc&limit=1000';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (open) params += `&status=in.(${OPEN_PROPOSAL_STATUSES.join(',')})`;
      if (lead_id) params += `&lead_id=eq.${encodeURIComponent(lead_id)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('proposals', params));
    }

    if (req.method === 'POST' && action === 'register') {
      const r = await registerProposal(req.body || {});
      return res.status(r.status).json(r.body);
    }

    if (req.method === 'POST') {
      const n = normalizeProposal(req.body);
      if (n.error) return res.status(400).json({ error: n.error });
      const today = madridNow().date;
      const fields = { status: 'enviada', ...n.fields };
      fields.sent_at ||= today;
      if (fields.lead_id && !UUID_RE.test(String(fields.lead_id))) return res.status(400).json({ error: 'lead_id inválido' });
      const created = await sbInsert('proposals', fields);
      if (created.lead_id) {
        const [lead] = await sbSelect('leads', `id=eq.${created.lead_id}&select=id,name,stage`);
        // Enviar una propuesta mueve al lead a "propuesta" si todavía estaba en una fase temprana
        if (lead && EARLY_STAGES.includes(lead.stage)) await sbUpdate('leads', lead.id, { stage: 'propuesta' });
        await logActivity('lead', created.lead_id, 'proposal',
          `Propuesta enviada${lead ? ` a "${lead.name}"` : ''}: ${created.title}${created.amount ? ` (${created.amount}€)` : ''}`,
          { proposal_id: created.id });
      }
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      const current = await loadProposal(id);
      const n = normalizeProposal(req.body, { partial: true });
      if (n.error) return res.status(400).json({ error: n.error });
      const updated = await sbUpdate('proposals', id, n.fields);
      if (n.fields.status && n.fields.status !== current.status && updated.lead_id) {
        await logActivity('lead', updated.lead_id, 'proposal',
          `Propuesta "${updated.title}" → ${STATUS_LABELS[n.fields.status]}`, { proposal_id: id });
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      await loadProposal(id);
      await sbDelete('proposals', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/proposals]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor', ...(err.candidates ? { candidates: err.candidates } : {}) });
  }
}
