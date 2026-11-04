-- Cobros de Stripe registrados automáticamente en payments (webhook + panel de Inicio).
-- stripe_payment_id guarda el id de la factura de Stripe; al ser único, registrar
-- dos veces el mismo cobro no crea duplicados (los NULL de pagos manuales no chocan).
create unique index if not exists payments_stripe_payment_id_key on public.payments(stripe_payment_id);

notify pgrst, 'reload schema';
