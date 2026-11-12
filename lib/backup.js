// lib/backup.js — Copia de seguridad automática en Supabase Storage
// ==========================================================
// Lo usa /api/backup-cron. Vuelca las tablas importantes en un JSON y lo guarda en el bucket
// PRIVADO "backups" (supabase/migrations/019_backups_bucket.sql), conservando solo las últimas
// BACKUP_KEEP. Las partes sin red (nombre del archivo, qué borrar) son puras para poder probarlas.
// Nunca se escriben datos de las filas en los logs: solo nombres de tabla y recuentos.
// ==========================================================

import { SB_URL, sbHeaders, sbReadHeaders, sbSelect } from './db.js';

export const BACKUP_BUCKET = 'backups';
export const BACKUP_KEEP = 30;
export const BACKUP_TABLES = [
  'leads', 'clients', 'payments', 'opportunities', 'tasks', 'events',
  'activities', 'receivables', 'proposals', 'message_templates',
];
const NAME_RE = /^backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

// backup-2026-11-12-0310.json (hora de España, así ordena por nombre = por fecha)
export function backupFileName(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(x => [x.type, x.value]));
  return `backup-${p.year}-${p.month}-${p.day}-${p.hour}${p.minute}.json`;
}

// Nombres de copias antiguas a borrar para quedarse con las `keep` más recientes.
// Solo toca archivos con el formato de nombre propio: cualquier otro archivo del bucket se respeta.
export function backupsToDelete(names, keep = BACKUP_KEEP) {
  const own = names.filter(n => NAME_RE.test(n)).sort();
  return own.length > keep ? own.slice(0, own.length - keep) : [];
}

async function selectAll(table) {
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; offset < 200000; offset += PAGE) {
    const rows = await sbSelect(table, `select=*&order=id&limit=${PAGE}&offset=${offset}`);
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

// Lee las tablas. Una tabla que falla se anota en `errors` (sin detalle de las filas) y la
// copia sigue con el resto: es mejor una copia parcial que ninguna.
export async function dumpTables(tables = BACKUP_TABLES) {
  const data = {};
  const counts = {};
  const errors = [];
  for (const t of tables) {
    try {
      data[t] = await selectAll(t);
      counts[t] = data[t].length;
    } catch (err) {
      errors.push(t);
      console.error('[backup] no se pudo leer la tabla', t, String(err.message || '').slice(0, 80));
    }
  }
  return { data, counts, errors };
}

async function storageFetch(path, init) {
  const r = await fetch(`${SB_URL}/storage/v1/${path}`, init);
  if (!r.ok) throw new Error(`Storage ${r.status}`);
  return r;
}

export async function uploadBackup(name, json) {
  await storageFetch(`object/${BACKUP_BUCKET}/${name}`, {
    method: 'POST',
    headers: { ...sbReadHeaders, 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: json,
  });
}

export async function listBackups() {
  const r = await storageFetch(`object/list/${BACKUP_BUCKET}`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({ prefix: '', limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
  });
  return (await r.json()).map(o => o.name);
}

export async function deleteBackups(names) {
  if (!names.length) return;
  await storageFetch(`object/${BACKUP_BUCKET}`, {
    method: 'DELETE',
    headers: sbHeaders,
    body: JSON.stringify({ prefixes: names }),
  });
}

// Hace la copia completa. Devuelve un resumen { file, at, counts, errors, deleted, size }.
export async function runBackup(now = new Date()) {
  const { data, counts, errors } = await dumpTables();
  if (errors.length === BACKUP_TABLES.length) throw new Error('No se pudo leer ninguna tabla');
  const file = backupFileName(now);
  const json = JSON.stringify({ created_at: now.toISOString(), tables: counts, data });
  await uploadBackup(file, json);
  let deleted = 0;
  try {
    const old = backupsToDelete(await listBackups());
    await deleteBackups(old);
    deleted = old.length;
  } catch (err) {
    console.error('[backup] no se pudieron limpiar copias antiguas', String(err.message || '').slice(0, 80));
  }
  return { file, at: now.toISOString(), counts, errors, deleted, size: json.length };
}
