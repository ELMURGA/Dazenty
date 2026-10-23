-- ============================================================
-- 012 — Programador de avisos push (pg_cron + pg_net)
-- ============================================================
-- Cada 5 minutos llama a /api/push-cron, que decide qué avisos tocan según la hora
-- de España y los ajustes guardados en app_settings. El secreto se guarda en Vault
-- con el nombre 'push_cron_secret' y debe coincidir con CRON_SECRET en Vercel:
--   select vault.create_secret('<mismo valor que CRON_SECRET>', 'push_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('dazenty-push') where exists (select 1 from cron.job where jobname = 'dazenty-push');

select cron.schedule('dazenty-push', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://dazenty.com/api/push-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$$);
