// api/opportunities.js — CRUD de oportunidades (negociaciones/propuestas en curso)
// ==========================================================
// GET    /api/opportunities              → lista (filtros: ?status=, ?client_id=)
// POST   /api/opportunities               → crear oportunidad
// PUT    /api/opportunities?id=xxx        → actualizar
// DELETE /api/opportunities?id=xxx        → eliminar (las automáticas se descartan, no se borran)
// POST   /api/opportunities?action=sync   → analiza cada cliente y genera las que falten
// ==========================================================

import { guard, sbSelect, sbInsert, sbUpdate, sbDelete, logActivity } from '../lib/db.js';
import { clientOpportunities } from '../lib/opportunity-rules.js';

const STATUSES = ['abierta', 'en_progreso', 'ganada', 'perdida'];

// Analiza el estado de todos los clientes y deja las oportunidades automáticas al día:
// crea las que faltan y retira las que ya no aplican y nadie ha tocado.
async function syncAutoOpportunities() {
  const [clients, projects, payments, existing] = await Promise.all([
    sbSelect('clients', 'select=id,client_name,service_name,status,amount_monthly,amount_annual,amount_onetime,stripe_subscription_id,stripe_subscription_status,stripe_current_period_end'),
    sbSelect('projects', 'select=id,client_id,name,status,delivered_at,updated_at'),
    sbSelect('payments', 'select=client_id,amount,coverage_end,service_concept'),
    sbSelect('opportunities', 'auto_key=not.is.null&select=id,client_id,auto_key,status,dismissed_at,created_at,updated_at'),
  ]);

  const byClient = (rows) => rows.reduce((acc, r) => {
    (acc[r.client_id] ||= []).push(r);
    return acc;
  }, {});
  const projectsBy = byClient(projects);
  const paymentsBy = byClient(payments);
  const existingKeys = new Set(existing.map(o => `${o.client_id}|${o.auto_key}`));
  const wantedKeys = new Set();
  let created = 0;
  let removed = 0;

  for (const client of clients) {
    const wanted = clientOpportunities(client, {
      projects: projectsBy[client.id] || [],
      payments: paymentsBy[client.id] || [],
    });
    for (const opp of wanted) {
      const key = `${client.id}|${opp.auto_key}`;
      wantedKeys.add(key);
      if (existingKeys.has(key)) continue;
      try {
        const row = await sbInsert('opportunities', { ...opp, client_id: client.id });
        await logActivity('opportunity', row.id, 'created', `Oportunidad detectada para ${client.client_name}: ${row.title}`);
        created++;
      } catch (err) {
        if (err.status !== 409) throw err; // 409 = otro análisis simultáneo ya la creó
      }
    }
  }

  // Las que ya no aplican se retiran solo si siguen abiertas y sin editar; si el admin
  // las ha trabajado (estado, importe…) se quedan como histórico.
  for (const o of existing) {
    const stale = !wantedKeys.has(`${o.client_id}|${o.auto_key}`);
    if (stale && o.status === 'abierta' && !o.dismissed_at && o.updated_at === o.created_at) {
      await sbDelete('opportunities', o.id);
      removed++;
    }
  }
  return { created, removed };
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  const { id, status, client_id, action } = req.query;

  try {
    if (req.method === 'GET') {
      let params = 'select=*&order=created_at.desc';
      if (status) params += `&status=eq.${encodeURIComponent(status)}`;
      if (client_id) params += `&client_id=eq.${encodeURIComponent(client_id)}`;
      // Se filtra aquí y no en la query para no depender de que la columna exista ya
      const rows = await sbSelect('opportunities', params);
      return res.json(rows.filter(o => !o.dismissed_at));
    }

    if (req.method === 'POST' && action === 'sync') {
      try {
        return res.json(await syncAutoOpportunities());
      } catch (err) {
        if (/auto_key|dismissed_at/.test(err.message || '')) {
          return res.status(503).json({ error: 'Falta aplicar la migración 009_opportunities_auto.sql en Supabase' });
        }
        throw err;
      }
    }

    if (req.method === 'POST') {
      const body = { ...req.body };
      if (!body.title) return res.status(400).json({ error: 'El título de la oportunidad es obligatorio' });
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      const created = await sbInsert('opportunities', body);
      await logActivity('opportunity', created.id, 'created', `Nueva oportunidad: ${created.title}`);
      return res.status(201).json(created);
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      const body = { ...req.body };
      if (body.status && !STATUSES.includes(body.status)) {
        return res.status(400).json({ error: `status inválido. Usa: ${STATUSES.join(', ')}` });
      }
      const updated = await sbUpdate('opportunities', id, body);
      if (body.status) {
        await logActivity('opportunity', id, 'status_changed', `Oportunidad "${updated.title}" → "${body.status}"`);
      }
      return res.json(updated);
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Parámetro id requerido' });
      // Una automática se marca como descartada en vez de borrarse: si se borrara, el
      // siguiente análisis la volvería a crear mientras el cliente siga en el mismo estado.
      const [row] = await sbSelect('opportunities', `id=eq.${encodeURIComponent(id)}&select=*`);
      if (row?.auto_key) {
        await sbUpdate('opportunities', id, { dismissed_at: new Date().toISOString() });
      } else {
        await sbDelete('opportunities', id);
      }
      await logActivity('opportunity', id, 'deleted', 'Oportunidad eliminada');
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (err) {
    console.error('[api/opportunities]', err);
    return res.status(err.status || 500).json({ error: err.message || 'Error del servidor' });
  }
}
