-- ============================================================
-- 006 — Endurecimiento de seguridad (auditoría oct. 2026)
-- ============================================================

-- 1. invoice_pdfs se creó sin RLS: cualquiera con la anon key podía leerla y escribirla.
--    El backend usa service_role, que no se ve afectado.
alter table public.invoice_pdfs enable row level security;

-- 2. Token secreto por cliente para el portal.
--    El slug se deriva del nombre del cliente y es adivinable; el token no.
alter table public.clients
  add column if not exists portal_token text not null default encode(extensions.gen_random_bytes(24), 'hex');
create unique index if not exists clients_portal_token_key on public.clients (portal_token);

-- 3. search_path fijo en el trigger de updated_at
alter function public.set_updated_at() set search_path = public;

-- 4. Límite de peticiones para endpoints públicos y para el login del panel
create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        integer     not null default 1,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;

-- Contabiliza una petición y devuelve true si sigue dentro del límite
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count  integer;
begin
  insert into rate_limits (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;

  if random() < 0.02 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_count <= p_max;
end;
$$;

-- Solo consulta (no contabiliza): true si la clave ya superó el límite en la ventana actual
create or replace function public.rate_limit_exceeded(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select count >= p_max from rate_limits
    where key = p_key
      and window_start = to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds)
  ), false);
$$;

revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_exceeded(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.rate_limit_exceeded(text, integer, integer) to service_role;
