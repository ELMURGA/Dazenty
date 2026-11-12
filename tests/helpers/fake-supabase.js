// Supabase de mentira, en memoria, para probar los endpoints reales sin red.
// Lo usan los tests y tools/admin-mock-server.mjs. Soporta lo que usan los endpoints:
// filtros eq/neq/in/is/lt/lte/gt/gte/ilike (y su negación con "not."), or=(...), order,
// limit/offset, PATCH/DELETE condicionales, POST con ignore/merge-duplicates, restricciones
// únicas sencillas y la API de Storage (subir, listar y borrar archivos de un bucket).
import { randomUUID } from 'node:crypto';

export const FAKE_HOST = 'fake.supabase.test';

const UNIQUE = { clients: ['slug'], message_templates: ['name'] };

function splitTop(str) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  return parts;
}

function ilikeRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && (pattern[i + 1] === '%' || pattern[i + 1] === '_')) { out += '\\' + pattern[++i]; continue; }
    if (ch === '*') out += '.*';
    else out += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`, 'i');
}

function compare(cell, val) {
  if (typeof cell === 'number') return cell - Number(val);
  return String(cell).localeCompare(String(val));
}

export function matches(row, key, cond) {
  let [op, ...rest] = cond.split('.');
  let val = rest.join('.');
  let negate = false;
  if (op === 'not') {
    negate = true;
    [op, ...rest] = val.split('.');
    val = rest.join('.');
  }
  const cell = row[key];
  let r;
  switch (op) {
    case 'eq': r = String(cell) === val; break;
    case 'neq': r = String(cell) !== val; break;
    case 'in': r = val.replace(/^\(|\)$/g, '').split(',').includes(String(cell)); break;
    case 'is': r = val === 'null' ? cell == null : String(cell) === val; break;
    case 'lt': r = cell != null && compare(cell, val) < 0; break;
    case 'lte': r = cell != null && compare(cell, val) <= 0; break;
    case 'gt': r = cell != null && compare(cell, val) > 0; break;
    case 'gte': r = cell != null && compare(cell, val) >= 0; break;
    case 'ilike': r = cell != null && ilikeRegex(val).test(String(cell)); break;
    default: r = true;
  }
  return negate ? !r : r;
}

export function filterRows(rows, params) {
  let out = rows;
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    if (k === 'or') {
      const terms = splitTop(v.replace(/^\(|\)$/g, '')).map(t => {
        const i = t.indexOf('.');
        return [t.slice(0, i), t.slice(i + 1)];
      });
      out = out.filter(r => terms.some(([key, cond]) => matches(r, key, cond)));
    } else {
      out = out.filter(r => matches(r, k, v));
    }
  }
  const order = params.get('order');
  if (order) {
    const specs = order.split(',').map(s => s.split('.'));
    out = [...out].sort((a, b) => {
      for (const [col, dir] of specs) {
        const x = a[col]; const y = b[col];
        if (x == null && y == null) continue;
        if (x == null) return 1;
        if (y == null) return -1;
        const c = compare(x, y);
        if (c) return dir === 'desc' ? -c : c;
      }
      return 0;
    });
  }
  return out;
}

const jr = (status, body) => new Response(body === null ? null : JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } });

// Crea la base de datos de mentira. Devuelve { db, storage, install, reset, calls }.
export function createFakeSupabase(tables) {
  const db = Object.fromEntries(tables.map(t => [t, []]));
  const storage = {}; // bucket → { nombre: contenido }
  const calls = [];
  const realFetch = globalThis.fetch;

  async function fake(url, init = {}) {
    const u = new URL(url);
    if (u.host !== FAKE_HOST) return realFetch(url, init);
    const method = init.method || 'GET';
    calls.push(`${method} ${u.pathname}`);

    if (u.pathname.startsWith('/rest/v1/rpc/')) return jr(200, u.pathname.endsWith('check_rate_limit'));

    if (u.pathname.startsWith('/storage/v1/')) {
      const path = u.pathname.replace('/storage/v1/', '');
      if (path.startsWith('object/list/')) {
        const bucket = path.slice('object/list/'.length);
        return jr(200, Object.keys(storage[bucket] || {}).sort().map(name => ({ name })));
      }
      const [, bucket, ...nameParts] = path.split('/');
      if (method === 'POST') { (storage[bucket] ||= {})[nameParts.join('/')] = init.body; return jr(200, { Key: `${bucket}/${nameParts.join('/')}` }); }
      if (method === 'DELETE') {
        for (const n of JSON.parse(init.body).prefixes) delete (storage[bucket] || {})[n];
        return jr(200, []);
      }
      return jr(405, {});
    }

    const table = u.pathname.replace('/rest/v1/', '');
    if (!db[table]) return jr(404, { code: '42P01', message: `relation "${table}" does not exist` });
    const body = init.body ? JSON.parse(init.body) : null;
    const prefer = (init.headers && init.headers.Prefer) || '';

    if (method === 'GET') {
      const rows = filterRows(db[table], u.searchParams);
      const offset = Number(u.searchParams.get('offset') || 0);
      const limit = Number(u.searchParams.get('limit') || 1000);
      return jr(200, rows.slice(offset, offset + limit).map(r => ({ ...r })));
    }
    if (method === 'POST') {
      const items = Array.isArray(body) ? body : [body];
      const created = [];
      for (const item of items) {
        const conflict = (UNIQUE[table] || []).find(col => db[table].some(r => r[col] === item[col]));
        const onConflict = u.searchParams.get('on_conflict');
        const existing = onConflict && db[table].find(r => r[onConflict] === item[onConflict]);
        const keyed = table === 'push_log' ? db[table].find(r => r.kind === item.kind && r.notif_date === item.notif_date) : existing;
        if (keyed) {
          if (prefer.includes('merge-duplicates')) Object.assign(keyed, item);
          continue; // ignore-duplicates / merge: no devuelve fila nueva
        }
        if (conflict) return jr(409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        const row = { id: randomUUID(), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...item };
        db[table].push(row);
        created.push(row);
      }
      return prefer.includes('return=minimal') ? jr(201, null) : jr(201, created);
    }
    if (method === 'PATCH') {
      const rows = filterRows(db[table], u.searchParams);
      rows.forEach(r => Object.assign(r, body, { updated_at: new Date().toISOString() }));
      return jr(200, rows.map(r => ({ ...r })));
    }
    if (method === 'DELETE') {
      const gone = new Set(filterRows(db[table], u.searchParams));
      db[table] = db[table].filter(r => !gone.has(r));
      return jr(204, null);
    }
    return jr(405, {});
  }

  return {
    get db() { return db; },
    storage,
    calls,
    install() { globalThis.fetch = fake; },
    reset() {
      for (const k of Object.keys(db)) db[k].length = 0;
      for (const k of Object.keys(storage)) delete storage[k];
      calls.length = 0;
    },
  };
}

// Llama a un handler de /api como lo haría Vercel y devuelve { code, body }
export async function callHandler(handler, { method = 'GET', query = {}, body, headers = { 'x-admin-password': 'secret-pass' } } = {}) {
  const res = {
    code: 200, body: undefined, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; },
  };
  await handler({ method, query, body, headers, socket: {} }, res);
  return res;
}
