-- 004_leads_n8n_fields.sql
-- Añade los campos que necesitan los flujos de n8n (prospección automática)
-- para guardar todos los datos del lead directamente en el CRM del dashboard,
-- y un external_id para poder actualizar (cambiar fase, marcar contactado, etc.)
-- el mismo lead más adelante sin crear duplicados.
-- =========================================================

alter table leads add column if not exists external_id text;
alter table leads add column if not exists website text;
alter table leads add column if not exists city text;
alter table leads add column if not exists sector text;
alter table leads add column if not exists instagram text;
alter table leads add column if not exists whatsapp text;

create index if not exists idx_leads_external_id on leads(external_id);
