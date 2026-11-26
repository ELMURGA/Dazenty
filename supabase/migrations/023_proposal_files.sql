-- ============================================================
-- 023 — Varios PDF por propuesta
-- ============================================================
-- `files` guarda la lista [{ url, name, size }] de PDF del bucket privado client-docs.
-- `url` queda solo para enlaces externos. APLICAR antes de desplegar el código que la usa.

alter table public.proposals add column if not exists files jsonb not null default '[]'::jsonb;
alter table public.proposals drop constraint if exists proposals_files_is_array;
alter table public.proposals add constraint proposals_files_is_array check (jsonb_typeof(files) = 'array');

-- Pasa a `files` el PDF que estaba en `url`, sin que cuente como movimiento (no aplaza seguimientos)
alter table public.proposals disable trigger trg_proposals_updated_at;
update public.proposals
   set files = jsonb_build_array(jsonb_build_object('url', url, 'name', regexp_replace(title, ' —.*$', '') || '.pdf')),
       url = null
 where files = '[]'::jsonb
   and url ~ '/storage/v1/object/public/client-docs/[a-z0-9-]+/proposal-[a-z0-9-]+\.pdf$';
alter table public.proposals enable trigger trg_proposals_updated_at;
