-- Cobros manuales de servicios, con o sin factura asociada.
alter table payments add column if not exists service_concept text;
alter table payments add column if not exists coverage_start date;
alter table payments add column if not exists coverage_end date;

alter table payments add constraint payments_coverage_valid check (
  (coverage_start is null and coverage_end is null)
  or (coverage_start is not null and coverage_end is not null and coverage_end >= coverage_start)
);

notify pgrst, 'reload schema';
