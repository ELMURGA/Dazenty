-- ============================================================
-- 016 — Plantillas de mensaje (WhatsApp / email)
-- ============================================================
-- Variables disponibles en el texto: {nombre} {empresa} {importe} {enlace}.
-- Las plantillas iniciales solo se insertan si no existen (se identifican por nombre),
-- así que volver a aplicar la migración no pisa lo que edites en el panel.

create table if not exists public.message_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null default 'general',
  body       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_message_templates_name on public.message_templates(name);

drop trigger if exists trg_message_templates_updated_at on public.message_templates;
create trigger trg_message_templates_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;

insert into public.message_templates (name, category, body) values
  ('Primer contacto', 'lead',
   E'Hola {nombre}, soy Alejandro, de Dazenty. He estado viendo la web de {empresa} y creo que podríamos mejorarla para que te ayude a conseguir más clientes.\n\n¿Te parece si te cuento cómo en un par de minutos? Sin compromiso.'),
  ('Seguimiento de propuesta', 'propuesta',
   E'Hola {nombre}, ¿qué tal? Te escribo para saber si has podido revisar la propuesta que te envié para {empresa}.\n\nSi tienes cualquier duda o quieres ajustar algo, dímelo y lo vemos. Te la dejo aquí por si la necesitas: {enlace}'),
  ('Recordatorio de cobro por Bizum', 'cobro',
   E'Hola {nombre}, te recuerdo que tienes pendiente el pago de {importe}. Puedes hacérmelo por Bizum cuando te venga bien y me avisas para confirmarlo.\n\nMuchas gracias.'),
  ('Tu demo está lista', 'demo',
   E'Hola {nombre}, ya tengo lista la demo de la web de {empresa}. Puedes verla aquí: {enlace}\n\nÉchale un vistazo y dime qué te parece; cualquier cambio lo vemos juntos.'),
  ('Agradecimiento tras la reunión', 'reunion',
   E'Hola {nombre}, gracias por la reunión de hoy. Ha sido un placer conocer mejor {empresa}.\n\nEn cuanto lo tenga preparado te envío lo que hemos hablado. Si mientras tanto se te ocurre cualquier duda, escríbeme por aquí.'),
  ('Renovación de mantenimiento', 'renovacion',
   E'Hola {nombre}, el mantenimiento de la web de {empresa} está a punto de vencer. Si quieres seguir con él, dímelo y te preparo la renovación para que no se corte nada.')
on conflict (name) do nothing;
