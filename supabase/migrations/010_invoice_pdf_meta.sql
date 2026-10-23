-- Dazenty OS - Datos para generar el PDF de la factura con el diseño de Canva
-- Los clientes no guardan teléfono ni dirección y el PDF necesita también método de pago,
-- teléfono de contacto y una fila extra opcional (p. ej. Hosting). Se guardan por factura
-- para poder regenerar el mismo PDF más adelante.
-- Claves: bill_name, bill_phone, bill_address, payment_method, contact_phone, extra_label, extra_value

alter table invoices add column if not exists pdf_meta jsonb not null default '{}'::jsonb;
