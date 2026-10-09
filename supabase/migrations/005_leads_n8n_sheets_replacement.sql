-- 005_leads_n8n_sheets_replacement.sql
-- Añade los campos que faltaban para poder retirar Google Sheets por completo de
-- los flujos de prospección de n8n (Dazenty OS pasa a ser la única fuente de datos):
--   - Los 3 textos generados por IA como columnas propias (antes solo vivían
--     mezclados dentro de "notes" en texto libre, lo que impedía reenviar un
--     email o recuperar un WhatsApp sin volver a generarlos).
--   - whatsapp_contacted_at: para que el flujo "Recuperar WhatsApp" y el comando
--     de Telegram "wa <empresa>" sepan si ya se contactó manualmente por
--     WhatsApp, sin depender de la columna "Contactado WhatsApp" de Sheets.
-- =========================================================

alter table leads add column if not exists email_asunto text;
alter table leads add column if not exists email_cuerpo text;
alter table leads add column if not exists whatsapp_msg text;
alter table leads add column if not exists instagram_msg text;
alter table leads add column if not exists whatsapp_contacted_at timestamptz;

create index if not exists idx_leads_whatsapp_contacted_at on leads(whatsapp_contacted_at);
