-- 009: Oportunidades generadas automáticamente a partir del estado de cada cliente
-- auto_key identifica la regla que la creó (p.ej. 'annual_upgrade', 'renewal:2027-10-01').
-- dismissed_at marca las que el admin ha borrado, para no volver a generarlas.
alter table opportunities add column if not exists auto_key text;
alter table opportunities add column if not exists dismissed_at timestamptz;

-- Una sola oportunidad por cliente y regla: evita duplicados si el análisis se lanza dos veces a la vez
create unique index if not exists idx_opportunities_client_auto_key
  on opportunities(client_id, auto_key) where auto_key is not null;
