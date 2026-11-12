-- ============================================================
-- 019 — Bucket PRIVADO para las copias de seguridad automáticas
-- ============================================================
-- Lo usa api/backup-cron.js (clave service_role, que ignora RLS). Sin políticas públicas:
-- nadie con la anon key puede listar ni descargar las copias.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 104857600, array['application/json'])
on conflict (id) do update set public = false;
