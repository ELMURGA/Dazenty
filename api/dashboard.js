// api/dashboard.js — KPIs agregados reales para la vista "Inicio"
// ==========================================================
// GET /api/dashboard → calcula todo a partir de datos reales en Supabase
// (ningún número hardcodeado: si no hay datos, los KPIs son 0 / listas vacías)
// ==========================================================

import { guard, sbSelect } from '../lib/db.js';
import { syncStripeSubscriptionPayments } from '../lib/stripe-sync.js';
import { dueFollowups, funnel, bySource } from '../lib/lead-rules.js';
import { summarizeReceivables } from '../lib/receivable-rules.js';
import { proposalDueByLead, proposalFollowup } from '../lib/proposal-rules.js';
import { upcomingRenewals } from '../lib/renewal-rules.js';

function monthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// Supabase devuelve como máximo 1000 filas por petición: se pagina para no cortar los leads
async function selectAll(table, params) {
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; offset < 100000; offset += PAGE) {
    const rows = await sbSelect(table, `${params}&limit=${PAGE}&offset=${offset}`);
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// Lo que depende de tablas de migraciones recientes no debe tumbar todo el Inicio si falla
async function optional(name, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.error(`[api/dashboard] ${name}:`, String(err.message || '').slice(0, 120));
    return fallback;
  }
}

export default async function handler(req, res) {
  if (await guard(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { start, end } = monthRange();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Añade a "Pagos" los cobros de suscripciones de Stripe que aún no estén
    // (por si el webhook falló o llegó antes de guardar la suscripción)
    try {
      await syncStripeSubscriptionPayments();
    } catch (err) {
      console.error('[api/dashboard] Sincronización con Stripe:', err);
    }

    const [
      paymentsMonth,
      invoicesOpen,
      projects,
      tasksOpen,
      leads,
      clients,
      expensesMonth,
      recentActivities,
      upcomingEvents,
      receivableRows,
      openProposals,
      coveragePayments,
    ] = await Promise.all([
      sbSelect('payments', `payment_date=gte.${start}&payment_date=lt.${end}&select=amount`),
      sbSelect('invoices', `status=in.(pendiente,parcial,vencida)&select=total,paid_amount`),
      sbSelect('projects', `select=id,status`),
      sbSelect('tasks', `status=neq.completada&select=*&order=due_date.asc.nullslast`),
      selectAll('leads', 'select=id,name,company,stage,source,created_at,updated_at,last_contact_at,next_followup_at,temperature,value_estimate,city,whatsapp,phone,email,awaiting_reply,replied_at&order=id'),
      sbSelect('clients', 'select=id,client_name,company_name,client_contact_name,client_contact_phone,status,service_name,stripe_subscription_id,stripe_subscription_status'),
      sbSelect('expenses', `expense_date=gte.${start}&expense_date=lt.${end}&select=amount`),
      sbSelect('activities', `select=*&order=created_at.desc&limit=12`),
      sbSelect('events', `start_at=gte.${new Date().toISOString()}&select=*&order=start_at.asc&limit=5`),
      optional('receivables', () => sbSelect('receivables',
        'status=eq.pendiente&select=id,client_id,concept,amount,due_date,status&order=due_date.asc&limit=1000'), []),
      optional('proposals', () => sbSelect('proposals',
        'status=in.(enviada,vista)&select=id,lead_id,client_id,title,amount,status,sent_at,next_followup_at,updated_at,created_at&limit=1000'), []),
      optional('renewals', () => sbSelect('payments',
        'stripe_payment_id=is.null&coverage_end=not.is.null&select=client_id,amount,coverage_end,service_concept&limit=1000'), []),
    ]);

    const facturado_mes = round2(paymentsMonth.reduce((s, p) => s + Number(p.amount), 0));
    const pendiente_cobro = round2(invoicesOpen.reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0));
    const gastos_mes = round2(expensesMonth.reduce((s, e) => s + Number(e.amount), 0));
    const beneficio_mes = round2(facturado_mes - gastos_mes);

    const proyectos_abiertos = projects.filter(p => ['planificacion', 'en_progreso', 'en_revision'].includes(p.status)).length;

    const tareas_urgentes_hoy = tasksOpen.filter(t => t.due_date && t.due_date <= today);
    const tareas_pendientes_total = tasksOpen.length;

    const leads_por_stage = leads.reduce((acc, l) => {
      acc[l.stage] = (acc[l.stage] || 0) + 1;
      return acc;
    }, {});
    const leads_nuevos_semana = leads.filter(l => l.created_at >= weekAgo).length;

    const embudo = funnel(leads);
    const proposalDue = proposalDueByLead(openProposals, today);
    const seguimientos = dueFollowups(leads, today, { proposalDue });
    const calientes = leads.filter(l => ['propuesta', 'reunion'].includes(l.stage));

    const clientes_activos = clients.filter(c => c.status === 'active').length;

    return res.json({
      facturado_mes,
      pendiente_cobro,
      gastos_mes,
      beneficio_mes,
      proyectos_abiertos,
      proyectos_total: projects.length,
      tareas_urgentes_hoy,
      tareas_pendientes_total,
      leads_por_stage,
      leads_nuevos_semana,
      leads_total: leads.length,
      embudo,
      leads_por_origen: bySource(leads).slice(0, 6),
      seguimientos_total: seguimientos.length,
      seguimientos: seguimientos.slice(0, 8).map(l => ({
        id: l.id, name: l.name, company: l.company, stage: l.stage, temperature: l.temperature,
        value_estimate: l.value_estimate, next_followup_at: l.next_followup_at,
        last_contact_at: l.last_contact_at, whatsapp: l.whatsapp, phone: l.phone, email: l.email,
        followup: l.followup, awaiting_reply: !!l.awaiting_reply, replied_at: l.replied_at || null,
        proposal_title: proposalDue.get(l.id)?.title || null,
      })),
      esperando_respuesta: leads.filter(l => l.awaiting_reply && !['ganado', 'perdido'].includes(l.stage)).length,
      leads_calientes: calientes.length,
      valor_calientes: round2(calientes.reduce((s, l) => s + (Number(l.value_estimate) || 0), 0)),
      emails_sin_enviar: embudo.counts.email_no_enviado || 0,
      cobros_pendientes: (() => {
        const names = Object.fromEntries(clients.map(c => [c.id, c.client_name]));
        const sum = summarizeReceivables(receivableRows, today, 6);
        return { ...sum, items: sum.items.map(r => ({ ...r, client_name: names[r.client_id] || 'Cliente' })) };
      })(),
      propuestas_abiertas: {
        count: openProposals.length,
        total: round2(openProposals.reduce((s, p) => s + (Number(p.amount) || 0), 0)),
        due: openProposals.filter(p => proposalFollowup(p, today).due).length,
      },
      renovaciones: upcomingRenewals(clients, coveragePayments, today).slice(0, 8),
      clientes_activos,
      clientes_total: clients.length,
      actividad_reciente: recentActivities,
      proximos_eventos: upcomingEvents,
    });
  } catch (err) {
    console.error('[api/dashboard]', err);
    return res.status(500).json({ error: err.message || 'Error del servidor' });
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
