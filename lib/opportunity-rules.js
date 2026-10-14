// lib/opportunity-rules.js — Reglas que deducen oportunidades a partir del estado de un cliente
// ==========================================================
// NO es un endpoint. Función pura (sin red ni BD) para poder testearla: recibe el
// cliente con sus proyectos y cobros y devuelve las oportunidades que le corresponden.
// Cada una lleva un `auto_key` estable: es lo que evita duplicarla en cada análisis.
// ==========================================================

const OPEN_PROJECT_STATUSES = ['planificacion', 'en_progreso', 'en_revision', 'pausado'];

// Margen para avisar de una renovación: desde 45 días antes hasta 60 días después de vencer
const RENEWAL_DAYS_BEFORE = 45;
const RENEWAL_DAYS_AFTER = 60;

const num = v => Number(v) || 0;

export function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function clientOpportunities(client, { projects = [], payments = [] } = {}, today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  const add = (auto_key, title, description, extra = {}) => out.push({
    auto_key, title, description, value: null, probability: 50, expected_close_date: null, ...extra,
  });

  const monthly = num(client.amount_monthly);
  const annual = num(client.amount_annual);
  const onetime = num(client.amount_onetime);
  const recurringYear = annual || monthly * 12;
  const service = client.service_name || 'el servicio';
  const sub = client.stripe_subscription_status || '';
  const subId = client.stripe_subscription_id || 'manual';
  const periodEnd = client.stripe_current_period_end
    ? new Date(Number(client.stripe_current_period_end) * 1000).toISOString().slice(0, 10)
    : null;

  // Cliente dado de baja: lo único que tiene sentido es intentar recuperarlo
  if (client.status !== 'active') {
    add('reactivate', 'Reactivar cliente',
      'El cliente está marcado como inactivo. Contactar para ver si quiere retomar el servicio.',
      { value: recurringYear || onetime || null, probability: 15, expected_close_date: addDays(today, 30) });
    return out;
  }

  // ── Estado de la suscripción ──────────────────────────────────────────────
  if (sub === 'past_due') {
    add(`recover_payment:${subId}`, 'Regularizar pago vencido',
      `La suscripción de ${service} tiene un pago vencido. Contactar para actualizar el método de pago antes de que se cancele.`,
      { value: recurringYear || null, probability: 70, expected_close_date: addDays(today, 7) });
  } else if (sub === 'canceling') {
    add(`retain:${subId}`, 'Retener antes de la baja',
      `Ha pedido cancelar ${service}${periodEnd ? ` y sigue activo hasta el ${periodEnd}` : ''}. Hablar con el cliente para entender el motivo y ofrecer una alternativa.`,
      { value: recurringYear || null, probability: 40, expected_close_date: periodEnd && periodEnd > today ? periodEnd : addDays(today, 14) });
  } else if (sub === 'canceled') {
    add(`winback:${subId}`, 'Recuperar suscripción cancelada',
      `La suscripción de ${service} está cancelada. Proponer volver, quizá con un plan ajustado.`,
      { value: recurringYear || null, probability: 20, expected_close_date: addDays(today, 30) });
  }
  // No se propone cambiar de plan a quien paga al día: si eligió mensual o anual, se respeta.

  // ── Propuesta enviada que todavía no ha pagado nada ───────────────────────
  if (!sub && !payments.length && (recurringYear || onetime)) {
    add('close_proposal', 'Cerrar propuesta pendiente',
      `Tiene ${service} presupuestado pero aún no hay ningún cobro ni suscripción. Hacer seguimiento para cerrarlo.`,
      { value: onetime + recurringYear, probability: 50, expected_close_date: addDays(today, 14) });
  }

  // ── Cobros manuales con cobertura (hosting/mantenimiento anual) ───────────
  const lastCovered = payments
    .filter(p => p.coverage_end)
    .sort((a, b) => (a.coverage_end < b.coverage_end ? 1 : -1))[0];
  // Solo una suscripción real de Stripe renueva sola; un estado "Activa" puesto a mano
  // (cliente que paga en efectivo o transferencia) no, así que su renovación sí se avisa.
  const subRunning = Boolean(client.stripe_subscription_id) && ['active', 'canceling', 'past_due'].includes(sub);
  const coverageRecent = lastCovered && lastCovered.coverage_end >= addDays(today, -RENEWAL_DAYS_AFTER);
  if (!subRunning && coverageRecent && lastCovered.coverage_end <= addDays(today, RENEWAL_DAYS_BEFORE)) {
    const expired = lastCovered.coverage_end < today;
    add(`renewal:${lastCovered.coverage_end}`, `Renovar ${lastCovered.service_concept || service}`,
      `La cobertura pagada ${expired ? 'venció' : 'vence'} el ${lastCovered.coverage_end}. Enviar la renovación.`,
      { value: num(lastCovered.amount) || null, probability: 75, expected_close_date: expired ? addDays(today, 7) : lastCovered.coverage_end });
  }

  // ── Cliente que pagó un trabajo puntual y no tiene nada recurrente ────────
  if (payments.length && !sub && !recurringYear && !coverageRecent) {
    add('maintenance_plan', 'Ofrecer plan de mantenimiento',
      'Ha pagado un trabajo puntual y no tiene ningún servicio recurrente. Proponer mantenimiento, hosting o soporte mensual.',
      { probability: 35, expected_close_date: addDays(today, 30) });
  }

  // ── Proyecto entregado y nada más en marcha ───────────────────────────────
  const hasOpenProject = projects.some(p => OPEN_PROJECT_STATUSES.includes(p.status));
  const lastDelivered = projects
    .filter(p => p.status === 'entregado')
    .sort((a, b) => ((a.delivered_at || a.updated_at || '') < (b.delivered_at || b.updated_at || '') ? 1 : -1))[0];
  if (!hasOpenProject && lastDelivered) {
    add(`next_project:${lastDelivered.id}`, 'Proponer siguiente fase',
      `El proyecto "${lastDelivered.name}" está entregado y no hay otro en curso. Buen momento para proponer mejoras o una ampliación.`,
      { probability: 30, expected_close_date: addDays(today, 30) });
  }

  return out;
}
