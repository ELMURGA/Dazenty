-- ============================================================
-- 015 — Cobros pendientes (lo que un cliente debe y aún no ha pagado)
-- ============================================================
-- Al marcar un cobro como "cobrado", la API crea el registro en payments y guarda
-- su id en payment_id. Aplicar ANTES de desplegar el código que usa api/receivables.js.

create table if not exists public.receivables (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients(id) on delete set null,
  concept     text not null,
  amount      numeric(12,2) not null check (amount > 0),
  due_date    date not null,
  status      text not null default 'pendiente' check (status in ('pendiente','cobrado','cancelado')),
  payment_id  uuid references public.payments(id) on delete set null,
  installment text check (installment is null or installment in ('primera_mitad','segunda_mitad','otro')),
  web_total   numeric(12,2),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_receivables_status_due on public.receivables(status, due_date);
create index if not exists idx_receivables_client on public.receivables(client_id);

drop trigger if exists trg_receivables_updated_at on public.receivables;
create trigger trg_receivables_updated_at before update on public.receivables
  for each row execute function public.set_updated_at();

alter table public.receivables enable row level security;

-- Caso real: Almacenes Camu debe 200 € de la segunda parte de la web.
-- Solo se crea si el cliente existe y si no se creó ya; el vencimiento (hoy) se puede editar en el panel.
insert into public.receivables (client_id, concept, amount, due_date, installment)
select c.id, 'Segunda parte de la web', 200, current_date, 'segunda_mitad'
from public.clients c
where c.client_name ilike 'Almacenes Camu%'
  and not exists (
    select 1 from public.receivables r
    where r.client_id = c.id and r.concept = 'Segunda parte de la web' and r.status = 'pendiente'
  )
order by c.created_at
limit 1;
