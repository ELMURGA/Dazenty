-- ============================================================
-- 021 — Dominios, canal de contacto por email y plantillas nuevas
-- ============================================================
-- 1) Tabla de dominios comprados con su caducidad. `alert_stage` guarda el último aviso
--    enviado ('30d', '7d', 'expired') para no repetirlo; se reinicia al cambiar la caducidad.
-- 2) leads.email_contacted_at: junto a whatsapp_contacted_at (migración 005) permite saber que
--    un lead fue contactado por email Y por WhatsApp, no solo por el primero.
-- 3) Plantillas nuevas (solo se insertan si no existen, así no pisa lo que edites).
-- Todo es aditivo: no cambia ni borra nada existente.

create table if not exists public.domains (
  id                 uuid primary key default gen_random_uuid(),
  domain             text not null,
  client_id          uuid references public.clients(id) on delete set null,
  registrar          text,
  registered_at      date,
  expires_at         date not null,
  renewal_price      numeric(10,2),
  notify_client      boolean not null default true,
  alert_stage        text,
  owner_notified_at  timestamptz,
  client_notified_at timestamptz,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists idx_domains_domain on public.domains(lower(domain));
create index if not exists idx_domains_expires on public.domains(expires_at);
create index if not exists idx_domains_client on public.domains(client_id);

drop trigger if exists trg_domains_updated_at on public.domains;
create trigger trg_domains_updated_at before update on public.domains
  for each row execute function public.set_updated_at();

alter table public.domains enable row level security;

alter table public.leads add column if not exists email_contacted_at timestamptz;

-- Los leads que ya tienen contacto por email registrado (canal email) se marcan con esa fecha
update public.leads
   set email_contacted_at = last_contact_at
 where email_contacted_at is null and channel = 'email' and last_contact_at is not null;

insert into public.message_templates (name, category, body) values
  ('Aviso de dominio por caducar', 'dominio',
   E'Hola {nombre}, te aviso de que el dominio {dominio} caduca el {fecha}. Para que la web y el correo de {empresa} no se corten, conviene renovarlo ya.\n\nSi quieres, me encargo yo de la renovación: dímelo y te paso los detalles.'),
  ('Dominio caducado', 'dominio',
   E'Hola {nombre}, el dominio {dominio} caducó el {fecha}. Todavía estamos a tiempo de recuperarlo, pero cuanto antes mejor. ¿Lo renuevo por ti?'),
  ('Propuesta enviada con precio', 'propuesta',
   E'Hola {nombre}, te acabo de enviar la propuesta para {empresa}: {importe} todo incluido.\n\nLa tienes aquí: {enlace}\n\nSi tienes cualquier duda o quieres ajustar algo, lo vemos juntos.'),
  ('Seguimiento tras el email', 'lead',
   E'Hola {nombre}, soy Alejandro, de Dazenty. Te escribí hace unos días por email sobre la web de {empresa} y por si se te pasó, te lo comento también por aquí.\n\n¿Te cuento en dos minutos cómo podríamos ayudarte? Sin compromiso.')
on conflict (name) do nothing;
