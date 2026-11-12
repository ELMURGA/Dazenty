// api/proposals.js — Estado de las propuestas enviadas a leads y clientes
// ==========================================================
// GET    /api/proposals                 → lista (filtros: ?status=, ?lead_id=, ?client_id=, ?open=1)
// POST   /api/proposals                 → crear { lead_id | client_id, title, amount?, sent_at?, channel?, url?, ... }
// PUT    /api/proposals?id=xxx          → editar (incluido el estado: enviada/vista/aceptada/rechazada/caducada)
// DELETE /api/proposals?id=xxx          → eliminar
// Todas requieren x-admin-password. Las abiertas (enviada/vista) sin movimiento en 5 días
// salen en "Hoy toca contactar" (lib/proposal-rules.js).
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';
import { madridNow } from '../lib/push.js';
import { normalizeProposal, OPEN_PROPOSAL_STATUSES } from '../lib/proposal-rules.js';

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

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { id, status, lead_id, client_id, open } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc,id.desc&limit=1000';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (open) params += `&status=in.(${OPEN_PROPOSAL_STATUSES.join(',')})`;
      if (lead_id) params += `&lead_id=eq.${encodeURIComponent(lead_id)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      return res.json(await sbSelect('proposals', params));
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
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
