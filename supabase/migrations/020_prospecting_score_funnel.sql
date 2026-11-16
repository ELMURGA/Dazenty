-- ============================================================
-- 020 — Puntuación de prospectos y embudo de prospección
-- ============================================================
-- La puntuación la calcula el subflujo de n8n "Motor comercial - Dazenty" y llega por
-- api/webhook-lead.js. Todas las columnas son opcionales: los leads antiguos no cambian.
-- APLICAR ANTES de desplegar el webhook que escribe estas columnas.

alter table public.leads add column if not exists score integer;
alter table public.leads add column if not exists priority text;
alter table public.leads add column if not exists approach text;
alter table public.leads add column if not exists message_version text;
alter table public.leads add column if not exists reply_type text;
alter table public.leads add column if not exists followup_sent_at timestamptz;

alter table public.leads drop constraint if exists leads_priority_valid;
alter table public.leads add constraint leads_priority_valid
  check (priority is null or priority in ('alta', 'media', 'baja', 'no_contactar'));
alter table public.leads drop constraint if exists leads_reply_type_valid;
alter table public.leads add constraint leads_reply_type_valid
  check (reply_type is null or reply_type in ('positiva', 'info', 'negativa', 'baja', 'automatica'));
alter table public.leads drop constraint if exists leads_score_valid;
alter table public.leads add constraint leads_score_valid check (score is null or (score between 0 and 100));

create index if not exists idx_leads_message_version on public.leads(message_version) where message_version is not null;

-- Embudo por origen, versión del mensaje y semana. No confunde enviado con entregado
-- (WhatsApp se envía a mano: la entrega solo se ve en WhatsApp) ni respuesta con oportunidad.
-- security_invoker: la vista respeta las políticas de la tabla leads (no la expone a anónimos).
create or replace view public.prospecting_funnel with (security_invoker = true) as
select
  coalesce(source, '(sin origen)')                         as origen,
  coalesce(message_version, 'anterior')                    as version_mensaje,
  date_trunc('week', created_at)::date                     as semana,
  count(*)                                                 as investigados,
  count(*) filter (where priority in ('alta', 'media'))    as cualificados,
  count(*) filter (where priority = 'no_contactar')        as descartados,
  count(*) filter (where whatsapp_msg is not null or email_cuerpo is not null) as mensajes_preparados,
  count(*) filter (where last_contact_at is not null or stage in ('contactada', 'propuesta', 'reunion', 'ganado')) as contactados,
  count(*) filter (where whatsapp_contacted_at is not null) as whatsapp_enviados,
  count(*) filter (where followup_sent_at is not null)     as seguimientos_enviados,
  count(*) filter (where reply_type in ('positiva', 'info', 'negativa', 'baja') or replied_at is not null) as respuestas,
  count(*) filter (where reply_type = 'positiva')          as respuestas_positivas,
  count(*) filter (where reply_type = 'info')              as piden_informacion,
  count(*) filter (where reply_type in ('negativa', 'baja')) as respuestas_negativas,
  count(*) filter (where reply_type = 'baja')              as bajas,
  count(*) filter (where stage = 'reunion')                as reuniones,
  count(*) filter (where stage = 'propuesta')              as presupuestos,
  count(*) filter (where stage = 'ganado')                 as clientes
from public.leads
group by 1, 2, 3;

revoke all on public.prospecting_funnel from anon, authenticated;
