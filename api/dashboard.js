// api/dashboard.js — KPIs agregados reales para la vista "Inicio"
// ==========================================================
// GET /api/dashboard → calcula todo a partir de datos reales en Supabase
// (ningún número hardcodeado: si no hay datos, los KPIs son 0 / listas vacías)
// ==========================================================

import { guard, sbSelect } from '../lib/db.js';

function monthRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export default async function handler(req, res) {
  if (guard(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { start, end } = monthRange();
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

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
    ] = await Promise.all([
      sbSelect('payments', `payment_date=gte.${start}&payment_date=lt.${end}&select=amount`),
      sbSelect('invoices', `status=in.(pendiente,parcial,vencida)&select=total,paid_amount`),
      sbSelect('projects', `select=id,status`),
      sbSelect('tasks', `status=neq.completada&select=id,title,due_date,priority&order=due_date.asc.nullslast`),
      sbSelect('leads', `select=id,stage,created_at`),
      sbSelect('clients', `select=id,status`),
      sbSelect('expenses', `expense_date=gte.${start}&expense_date=lt.${end}&select=amount`),
      sbSelect('activities', `select=*&order=created_at.desc&limit=12`),
      sbSelect('events', `start_at=gte.${new Date().toISOString()}&select=*&order=start_at.asc&limit=5`),
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
