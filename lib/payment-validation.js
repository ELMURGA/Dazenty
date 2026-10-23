export function validatePayment(body) {
  if (!body.client_id) return 'client_id es obligatorio';
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0.01 || amount >= 1e10 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
    return 'El importe debe ser positivo y tener como máximo dos decimales';
  }
  const validDate = value => typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (body.payment_date !== undefined && !validDate(body.payment_date)) {
    return 'Fecha de cobro inválida';
  }
  const start = body.coverage_start;
  const end = body.coverage_end;
  const kind = body.payment_kind ?? 'servicio';
  if (!['servicio', 'web'].includes(kind)) return 'Tipo de cobro inválido';
  if (kind === 'web') {
    // Cobro de la web por partes: sin período cubierto, con el precio total y la parte cobrada
    if (start != null || end != null) return 'El cobro de una web no lleva período cubierto';
    const total = Number(body.web_total);
    if (!Number.isFinite(total) || total < amount || total >= 1e10 ||
        Math.abs(total * 100 - Math.round(total * 100)) > 0.000001) {
      return 'Indica el precio total de la web (no puede ser menor que lo cobrado)';
    }
    if (!['primera_mitad', 'segunda_mitad', 'otro'].includes(body.installment)) {
      return 'Indica qué parte de la web se ha cobrado';
    }
  } else if (body.web_total != null || body.installment != null) {
    return 'El precio de la web solo se indica en cobros de web';
  }
  if (start != null || end != null) {
    if (!validDate(start) || !validDate(end) || end < start) {
      return 'Indica un período válido: la fecha final no puede ser anterior a la inicial';
    }
    if (typeof body.service_concept !== 'string' || !body.service_concept.trim()) {
      return 'Indica el concepto del servicio cubierto';
    }
  }
  if (body.service_concept != null &&
      (typeof body.service_concept !== 'string' || body.service_concept.length > 200)) {
    return 'El concepto debe ser un texto de hasta 200 caracteres';
  }
  return null;
}
