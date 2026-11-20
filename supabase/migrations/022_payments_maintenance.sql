-- Cobros de mantenimiento: se marcan aparte para que salgan en el apartado Mantenimiento y no en Pagos.
alter table public.payments add column if not exists is_maintenance boolean not null default false;

notify pgrst, 'reload schema';
