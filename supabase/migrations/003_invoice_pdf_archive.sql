-- Dazenty OS - Archivo de facturas en PDF organizadas por cliente
-- Permite subir las facturas ya emitidas (en PDF) y verlas agrupadas por cliente,
-- independientemente del sistema de "Nueva factura" (líneas/IVA/cobro).

create table if not exists invoice_pdfs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  label text,
  file_name text not null,
  file_url text not null,
  amount numeric(12,2),
  issue_date date,
  created_at timestamptz not null default now()
);
create index if not exists idx_invoice_pdfs_client on invoice_pdfs(client_id);
create index if not exists idx_invoice_pdfs_created on invoice_pdfs(created_at desc);
