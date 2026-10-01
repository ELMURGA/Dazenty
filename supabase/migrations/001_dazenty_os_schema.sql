-- Dazenty OS - Esquema inicial (Fase 0)
-- Añade las tablas necesarias para cubrir el ciclo de vida completo:
-- Lead -> Oportunidad -> Cliente -> Proyecto -> Presupuesto -> Factura -> Pago -> Ingreso -> Gasto -> Beneficio
-- No modifica la tabla "clients" existente, solo añade relaciones hacia ella.

create extension if not exists pgcrypto;

-- Función genérica para mantener updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =========================================================
-- 1. LEADS (CRM - pipeline de entrada)
-- =========================================================
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  company text,
  source text default 'manual',
  stage text not null default 'nuevo'
    check (stage in ('nuevo','contactada','propuesta','reunion','ganado','perdido')),
  value_estimate numeric(12,2),
  notes text,
  lost_reason text,
  converted_client_id uuid references clients(id) on delete set null,
  assigned_to text default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_leads_stage on leads(stage);
create index if not exists idx_leads_converted_client on leads(converted_client_id);
drop trigger if exists trg_leads_updated_at on leads;
create trigger trg_leads_updated_at before update on leads
  for each row execute function set_updated_at();

-- =========================================================
-- 2. OPPORTUNITIES (negociaciones / propuestas en curso)
-- =========================================================
create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  title text not null,
  description text,
  value numeric(12,2),
  status text not null default 'abierta'
    check (status in ('abierta','en_progreso','ganada','perdida')),
  probability int default 50 check (probability between 0 and 100),
  expected_close_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_opportunities_client on opportunities(client_id);
create index if not exists idx_opportunities_status on opportunities(status);
drop trigger if exists trg_opportunities_updated_at on opportunities;
create trigger trg_opportunities_updated_at before update on opportunities
  for each row execute function set_updated_at();

-- =========================================================
-- 3. PROJECTS (proyectos de entrega real)
-- =========================================================
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete set null,
  name text not null,
  description text,
  status text not null default 'planificacion'
    check (status in ('planificacion','en_progreso','en_revision','entregado','pausado','cancelado')),
  start_date date,
  due_date date,
  delivered_at timestamptz,
  budget numeric(12,2),
  progress int default 0 check (progress between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_projects_client on projects(client_id);
create index if not exists idx_projects_status on projects(status);
drop trigger if exists trg_projects_updated_at on projects;
create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();

-- =========================================================
-- 4. TASKS
-- =========================================================
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pendiente'
    check (status in ('pendiente','en_progreso','completada','cancelada')),
  priority text not null default 'media'
    check (priority in ('baja','media','alta','urgente')),
  due_date date,
  completed_at timestamptz,
  assigned_to text default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tasks_project on tasks(project_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_due_date on tasks(due_date);
drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

-- =========================================================
-- 5. INVOICES + INVOICE_ITEMS
-- =========================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  invoice_number text unique,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 21,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'pendiente'
    check (status in ('pendiente','pagada','parcial','vencida','cancelada')),
  paid_amount numeric(12,2) not null default 0,
  notes text,
  pdf_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_invoices_client on invoices(client_id);
create index if not exists idx_invoices_status on invoices(status);
drop trigger if exists trg_invoices_updated_at on invoices;
create trigger trg_invoices_updated_at before update on invoices
  for each row execute function set_updated_at();

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  sort_order int default 0
);
create index if not exists idx_invoice_items_invoice on invoice_items(invoice_id);

-- =========================================================
-- 6. PAYMENTS (ingresos reales)
-- =========================================================
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete set null,
  client_id uuid not null references clients(id) on delete cascade,
  amount numeric(12,2) not null,
  payment_date date not null default current_date,
  payment_method text default 'otro'
    check (payment_method in ('stripe','transferencia','efectivo','bizum','otro')),
  stripe_payment_id text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_client on payments(client_id);
create index if not exists idx_payments_invoice on payments(invoice_id);
create index if not exists idx_payments_date on payments(payment_date);

-- =========================================================
-- 7. EXPENSE_CATEGORIES + EXPENSES (gastos)
-- =========================================================
create table if not exists expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  color text default '#d97762',
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references expense_categories(id) on delete set null,
  description text not null,
  amount numeric(12,2) not null,
  expense_date date not null default current_date,
  vendor text,
  payment_method text default 'otro',
  receipt_url text,
  recurring boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_expenses_category on expenses(category_id);
create index if not exists idx_expenses_date on expenses(expense_date);
drop trigger if exists trg_expenses_updated_at on expenses;
create trigger trg_expenses_updated_at before update on expenses
  for each row execute function set_updated_at();

-- =========================================================
-- 8. EVENTS (calendario)
-- =========================================================
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_type text default 'otro'
    check (event_type in ('reunion','entrega','pago','recordatorio','otro')),
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean default false,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_events_start on events(start_at);
create index if not exists idx_events_client on events(client_id);
drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at before update on events
  for each row execute function set_updated_at();

-- =========================================================
-- 9. ACTIVITIES (feed de actividad / auditoría)
-- =========================================================
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  description text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_entity on activities(entity_type, entity_id);
create index if not exists idx_activities_created on activities(created_at desc);

-- =========================================================
-- 10. CONTACTS (contactos por cliente)
-- =========================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_contacts_client on contacts(client_id);
drop trigger if exists trg_contacts_updated_at on contacts;
create trigger trg_contacts_updated_at before update on contacts
  for each row execute function set_updated_at();

-- =========================================================
-- 11. DOCUMENTS (repositorio de documentos por cliente/proyecto)
-- =========================================================
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  name text not null,
  doc_type text default 'otro'
    check (doc_type in ('propuesta','factura','contrato','otro')),
  file_url text not null,
  file_size bigint,
  uploaded_at timestamptz not null default now()
);
create index if not exists idx_documents_client on documents(client_id);

-- =========================================================
-- RLS: se bloquea todo acceso directo (anon/authenticated).
-- El backend (serverless functions) usa siempre la service_role key,
-- que ignora RLS, igual que ya ocurre con la tabla "clients".
-- =========================================================
alter table leads enable row level security;
alter table opportunities enable row level security;
alter table projects enable row level security;
alter table tasks enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;
alter table payments enable row level security;
alter table expense_categories enable row level security;
alter table expenses enable row level security;
alter table events enable row level security;
alter table activities enable row level security;
alter table contacts enable row level security;
alter table documents enable row level security;

-- Categorías de gasto iniciales (vacío a propósito: sin datos de ejemplo/falsos,
-- se crean desde la UI real cuando el usuario las necesite)
