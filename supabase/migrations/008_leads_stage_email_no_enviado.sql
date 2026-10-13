-- 008_leads_stage_email_no_enviado.sql
-- Añade la fase "email_no_enviado" al pipeline de leads: ahí caen los leads de
-- los flujos de prospección de n8n cuyo email automático no se pudo enviar
-- (sin email válido o fallo de Gmail), para revisarlos aparte de los "nuevo".
-- =========================================================

alter table leads drop constraint if exists leads_stage_check;
alter table leads add constraint leads_stage_check
  check (stage in ('nuevo','email_no_enviado','contactada','propuesta','reunion','ganado','perdido'));
