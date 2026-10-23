-- ============================================================
-- 011 — Avisos push del panel, control de historias y cobros de web
-- ============================================================

-- 1. Cobros de web por partes (50 % al empezar y 50 % al terminar).
--    payment_kind = 'web' no lleva período cubierto: web_total guarda el precio
--    total de la web y installment qué parte se cobró.
alter table public.payments add column if not exists payment_kind text not null default 'servicio';
alter table public.payments add column if not exists web_total numeric(12,2);
alter table public.payments add column if not exists installment text;

alter table public.payments drop constraint if exists payments_kind_valid;
alter table public.payments add constraint payments_kind_valid check (
  (payment_kind = 'servicio' and web_total is null and installment is null)
  or (payment_kind = 'web'
      and web_total is not null and web_total >= amount
      and installment in ('primera_mitad','segunda_mitad','otro')
      and coverage_start is null and coverage_end is null)
);

-- 2. Dispositivos suscritos a las notificaciones push del panel
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

-- 3. Ajustes del panel (horas de los avisos, enlaces de historias…)
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;

insert into public.app_settings (key, value) values
  ('notifications', '{"tasks_time":"07:00","story_time":"14:30","story_days":[1,2,3,4,5],"weekly_time":"18:00","tasks_enabled":true,"story_enabled":true,"weekly_enabled":true}'::jsonb),
  ('story_links', '[{"title":"Calendario Dazenty","url":"https://claude.ai/artifact/BqHAt66wA41GDhU88hD3Jd"}]'::jsonb)
on conflict (key) do nothing;

-- 4. Registro de avisos enviados: evita repetir el mismo aviso el mismo día
create table if not exists public.push_log (
  kind       text not null,
  notif_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (kind, notif_date)
);
alter table public.push_log enable row level security;

-- 5. Días en los que la historia ya está subida (si está marcada, no se avisa)
create table if not exists public.story_days (
  story_date date primary key,
  done_at    timestamptz not null default now()
);
alter table public.story_days enable row level security;

notify pgrst, 'reload schema';
