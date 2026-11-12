-- 014: Seguimiento de leads (último contacto, próximo seguimiento, canal y temperatura)
-- Todas las columnas son opcionales: los leads que ya existen siguen funcionando igual.
-- El historial por lead reutiliza la tabla "activities" (entity_type = 'lead'), que ya
-- tiene el índice (entity_type, entity_id).

alter table leads add column if not exists last_contact_at timestamptz;
alter table leads add column if not exists next_followup_at date;
alter table leads add column if not exists channel text;
alter table leads add column if not exists temperature text;

alter table leads drop constraint if exists leads_temperature_valid;
alter table leads add constraint leads_temperature_valid
  check (temperature is null or temperature in ('caliente', 'templado', 'frio'));

alter table leads drop constraint if exists leads_channel_valid;
alter table leads add constraint leads_channel_valid
  check (channel is null or channel in ('whatsapp', 'instagram', 'email', 'llamada', 'reunion', 'otro'));

-- Para la vista "Hoy toca contactar" y el aviso diario
create index if not exists idx_leads_next_followup on leads(next_followup_at) where next_followup_at is not null;
