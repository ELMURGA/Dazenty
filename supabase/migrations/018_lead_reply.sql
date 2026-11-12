-- ============================================================
-- 018 — "Ha respondido, falta contestar"
-- ============================================================
-- awaiting_reply = el lead ha escrito y está esperando nuestra respuesta. Lo activa el
-- panel o n8n (api/webhook-lead.js, campo mark_replied) y se desactiva al registrar un
-- contacto nuestro.

alter table public.leads add column if not exists replied_at timestamptz;
alter table public.leads add column if not exists awaiting_reply boolean not null default false;

create index if not exists idx_leads_awaiting_reply on public.leads(awaiting_reply) where awaiting_reply;
