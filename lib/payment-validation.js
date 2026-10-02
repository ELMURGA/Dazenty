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
