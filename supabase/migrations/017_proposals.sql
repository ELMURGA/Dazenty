-- ============================================================
-- 017 — Estado de propuestas (enviada → vista → aceptada/rechazada/caducada)
-- ============================================================
-- Una propuesta cuelga de un lead o de un cliente. Las enviadas/vistas sin movimiento
-- durante 5 días aparecen en "Hoy toca contactar" (lib/proposal-rules.js).

create table if not exists public.proposals (
  id               uuid primary key default gen_random_uuid(),
  lead_id          uuid references public.leads(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete cascade,
  title            text not null,
  amount           numeric(12,2),
  sent_at          date,
  channel          text check (channel is null or channel in ('whatsapp','instagram','email','llamada','reunion','otro')),
  status           text not null default 'enviada' check (status in ('enviada','vista','aceptada','rechazada','caducada')),
  next_followup_at date,
  url              text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint proposals_has_owner check (lead_id is not null or client_id is not null)
);
create index if not exists idx_proposals_status on public.proposals(status);
create index if not exists idx_proposals_lead on public.proposals(lead_id) where lead_id is not null;
create index if not exists idx_proposals_client on public.proposals(client_id) where client_id is not null;

drop trigger if exists trg_proposals_updated_at on public.proposals;
create trigger trg_proposals_updated_at before update on public.proposals
  for each row execute function public.set_updated_at();

alter table public.proposals enable row level security;
