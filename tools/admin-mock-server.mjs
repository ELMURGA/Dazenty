// Servidor de pruebas LOCAL del panel: sirve la web y ejecuta los handlers reales de /api contra una
// base de datos falsa en memoria (nunca toca Supabase de producción).
//
//   node tools/admin-mock-server.mjs      →  http://localhost:4180/admin   (contraseña: secret-pass)
//
// Los datos son inventados y se reinician cada vez que arrancas el servidor.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createFakeSupabase } from '../tests/helpers/fake-supabase.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 4180;
process.env.SUPABASE_URL = 'https://fake.supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'service-key';
process.env.ADMIN_PASSWORD = 'secret-pass';
process.env.N8N_WEBHOOK_SECRET = 'n8n-secret';

const fake = createFakeSupabase(['leads', 'clients', 'opportunities', 'activities', 'payments', 'invoices', 'projects', 'tasks',
  'expenses', 'events', 'push_subscriptions', 'app_settings', 'story_days', 'push_log', 'contacts', 'documents', 'invoice_pdfs',
  'receivables', 'proposals', 'message_templates', 'domains']);
fake.install();
const { db } = fake;

const day = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ts = n => new Date(Date.now() + n * 86400000).toISOString();
const CITIES = ['Sevilla', 'Córdoba', 'Santiago de Chile', 'Madrid', 'Málaga'];
const names = ['Bodegas Acosta', 'Specialty Flavours', 'Taragüi', 'Tati', 'Asesoría Ruiz', 'Gestoría Montero', 'Hacienda A', 'Floristería Luna'];

for (let i = 0; i < 140; i++) {
  const stage = i < 3 ? 'propuesta' : i === 3 ? 'reunion' : i < 60 ? 'contactada' : i < 90 ? 'email_no_enviado' : i < 130 ? 'nuevo' : i < 134 ? 'ganado' : 'perdido';
  db.leads.push({
    id: randomUUID(), name: i < names.length ? names[i] : `Lead de prueba ${i}`, company: i % 3 === 0 ? `Empresa ${i} S.L.` : null,
    email: `lead${i}@ejemplo.test`, phone: i % 4 === 0 ? `6${String(10000000 + i * 137).slice(0, 8)}` : null,
    whatsapp: i % 5 === 0 ? `34657${String(100000 + i)}` : null, instagram: i % 6 === 0 ? `@lead${i}` : null,
    city: CITIES[i % CITIES.length], sector: 'Asesoría', source: i % 2 ? 'n8n-prospeccion' : i % 7 === 0 ? 'referido' : 'manual',
    stage, value_estimate: i < 4 ? 1200 + i * 300 : null,
    temperature: i === 0 ? 'caliente' : i === 1 ? 'templado' : null,
    channel: i < 3 ? 'whatsapp' : null,
    last_contact_at: i < 3 ? ts(-9 - i) : i % 9 === 0 ? ts(-2) : null,
    next_followup_at: i === 3 ? day(0) : i === 10 ? day(-4) : i === 11 ? day(3) : null,
    awaiting_reply: i === 4 || i === 20, replied_at: i === 4 ? ts(-2) : i === 20 ? ts(-1) : null,
    notes: i < 4 ? 'Hablamos por WhatsApp.\nPendiente de enviar propuesta.' : null,
    created_at: ts(-30 + (i % 25)), updated_at: ts(-(i % 20)),
  });
}

const camu = { id: randomUUID(), slug: 'almacenes-camu', client_name: 'Almacenes Camu', company_name: 'Almacenes Camu S.L.', client_contact_name: 'Paco Camu', client_contact_phone: '657 123 456', status: 'active', portal_token: 'x', service_tags: [] };
const perez = { id: randomUUID(), slug: 'asesoria-perez', client_name: 'Asesoría Pérez', client_contact_name: 'Marta Pérez', client_contact_phone: '+34 611 222 333', status: 'active', portal_token: 'y', service_tags: [] };
const shafiq = { id: randomUUID(), slug: 'muhammad-shafiq', client_name: 'Muhammad Shafiq', status: 'active', portal_token: 'z', service_tags: [] };
db.clients.push(camu, perez, shafiq);

db.receivables.push(
  { id: randomUUID(), client_id: camu.id, concept: 'Segunda parte de la web', amount: 200, due_date: day(0), status: 'pendiente', installment: 'segunda_mitad', created_at: ts(-3) },
  { id: randomUUID(), client_id: perez.id, concept: 'Hosting y mantenimiento anual', amount: 120, due_date: day(-5), status: 'pendiente', created_at: ts(-20) },
  { id: randomUUID(), client_id: shafiq.id, concept: 'Cambios de la web', amount: 60, due_date: day(9), status: 'pendiente', created_at: ts(-2) },
);
db.payments.push(
  { id: randomUUID(), client_id: perez.id, amount: 120, payment_date: day(-340), payment_method: 'bizum', payment_kind: 'servicio', service_concept: 'Mantenimiento y hosting', coverage_start: day(-340), coverage_end: day(25) },
  { id: randomUUID(), client_id: shafiq.id, amount: 100, payment_date: day(-375), payment_method: 'transferencia', payment_kind: 'servicio', service_concept: 'Hosting', coverage_start: day(-375), coverage_end: day(-10) },
);
db.proposals.push(
  { id: randomUUID(), lead_id: db.leads[0].id, title: 'Web corporativa', amount: 1200, sent_at: day(-9), channel: 'whatsapp', status: 'enviada', url: 'https://ejemplo.test/propuesta-acosta', created_at: ts(-9), updated_at: ts(-9) },
  { id: randomUUID(), lead_id: db.leads[1].id, title: 'Tienda online', amount: 1500, sent_at: day(-3), channel: 'email', status: 'vista', created_at: ts(-3), updated_at: ts(-3) },
  { id: randomUUID(), client_id: perez.id, title: 'Renovación del posicionamiento SEO', amount: 480, sent_at: day(-20), status: 'aceptada', created_at: ts(-20), updated_at: ts(-12) },
);
// Una propuesta con dos PDF ya subidos, para probar «Ver», cambiarlos y quitarlos
const demoPdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
fake.storage['client-docs'] = { 'lead-de-prueba/proposal-1.pdf': demoPdf, 'lead-de-prueba/proposal-2.pdf': demoPdf };
db.proposals[1].files = ['Propuesta tienda online.pdf', 'Panel de pedidos.pdf'].map((name, i) => ({
  url: `https://fake.supabase.test/storage/v1/object/public/client-docs/lead-de-prueba/proposal-${i + 1}.pdf`, name, size: demoPdf.length,
}));
db.domains.push(
  { id: randomUUID(), domain: 'almacenescamu.es', client_id: camu.id, registrar: 'IONOS', registered_at: day(-340), expires_at: day(25), renewal_price: 14.9, notify_client: true, alert_stage: null, created_at: ts(-340) },
  { id: randomUUID(), domain: 'asesoriaperez.com', client_id: perez.id, registrar: 'Vercel', registered_at: day(-360), expires_at: day(4), renewal_price: 17, notify_client: true, alert_stage: '30d', client_notified_at: ts(-20), created_at: ts(-360) },
  { id: randomUUID(), domain: 'shafiq.es', client_id: shafiq.id, registrar: 'Namecheap', registered_at: day(-400), expires_at: day(-6), renewal_price: 12, notify_client: true, created_at: ts(-400) },
  { id: randomUUID(), domain: 'dazenty.com', registrar: 'Vercel', registered_at: day(-100), expires_at: day(265), renewal_price: 15, notify_client: false, created_at: ts(-100) },
);
// Un lead contactado por email Y por WhatsApp, y otro solo por WhatsApp
db.leads[5].email_contacted_at = ts(-6); db.leads[5].whatsapp_contacted_at = ts(-2); db.leads[5].last_contact_at = ts(-2); db.leads[5].channel = 'whatsapp';
db.leads[6].whatsapp_contacted_at = ts(-1); db.leads[6].last_contact_at = ts(-1); db.leads[6].channel = 'whatsapp';
db.leads[7].email_contacted_at = ts(-4); db.leads[7].last_contact_at = ts(-4); db.leads[7].channel = 'email';
const seeds = [
  ['Aviso de dominio por caducar', 'dominio', 'Hola {nombre}, te aviso de que el dominio {dominio} caduca el {fecha}. Para que la web y el correo de {empresa} no se corten, conviene renovarlo ya.\n\nSi quieres, me encargo yo de la renovación: dímelo y te paso los detalles.'],
  ['Seguimiento tras el email', 'lead', 'Hola {nombre}, soy Alejandro, de Dazenty. Te escribí hace unos días por email sobre la web de {empresa} y por si se te pasó, te lo comento también por aquí.'],
  ['Primer contacto', 'lead', 'Hola {nombre}, soy Alejandro, de Dazenty. He estado viendo la web de {empresa} y creo que podríamos mejorarla para que te ayude a conseguir más clientes.\n\n¿Te parece si te cuento cómo en un par de minutos? Sin compromiso.'],
  ['Seguimiento de propuesta', 'propuesta', 'Hola {nombre}, ¿qué tal? Te escribo para saber si has podido revisar la propuesta que te envié para {empresa}.\n\nSi tienes cualquier duda o quieres ajustar algo, dímelo y lo vemos. Te la dejo aquí por si la necesitas: {enlace}'],
  ['Recordatorio de cobro por Bizum', 'cobro', 'Hola {nombre}, te recuerdo que tienes pendiente el pago de {importe}. Puedes hacérmelo por Bizum cuando te venga bien y me avisas para confirmarlo.\n\nMuchas gracias.'],
  ['Tu demo está lista', 'demo', 'Hola {nombre}, ya tengo lista la demo de la web de {empresa}. Puedes verla aquí: {enlace}\n\nÉchale un vistazo y dime qué te parece; cualquier cambio lo vemos juntos.'],
  ['Agradecimiento tras la reunión', 'reunion', 'Hola {nombre}, gracias por la reunión de hoy. Ha sido un placer conocer mejor {empresa}.\n\nEn cuanto lo tenga preparado te envío lo que hemos hablado. Si mientras tanto se te ocurre cualquier duda, escríbeme por aquí.'],
  ['Renovación de mantenimiento', 'renovacion', 'Hola {nombre}, el mantenimiento de la web de {empresa} está a punto de vencer. Si quieres seguir con él, dímelo y te preparo la renovación para que no se corte nada.'],
];
for (const [name, category, body] of seeds) db.message_templates.push({ id: randomUUID(), name, category, body, active: true, created_at: ts(-30) });

db.tasks.push({ id: randomUUID(), title: 'Revisar propuesta de Bodegas Acosta', status: 'pendiente', priority: 'alta', due_date: day(0) });
db.events.push({ id: randomUUID(), title: 'Llamada con Tati', start_at: ts(1) });
db.activities.push({ id: randomUUID(), entity_type: 'lead', entity_id: db.leads[0].id, action: 'created', description: 'Nuevo lead: Bodegas Acosta', created_at: ts(-20) });
db.activities.push({ id: randomUUID(), entity_type: 'lead', entity_id: db.leads[0].id, action: 'stage_changed', description: 'Lead "Bodegas Acosta" movido a "propuesta"', created_at: ts(-12) });
db.app_settings.push({ key: 'story_links', value: [{ title: 'Calendario Dazenty', url: 'https://claude.ai/artifact/BqHAt66wA41GDhU88hD3Jd' }] });
for (const n of [0, -1, -2]) db.story_days.push({ story_date: day(n) });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  // Hace de Storage: sirve los PDF que el panel abre con la URL firmada
  if (u.pathname.startsWith('/__storage/')) {
    const [bucket, ...rest] = decodeURIComponent(u.pathname.slice('/__storage/'.length)).replace(/^upload\//, '').split('/');
    if (req.method === 'PUT') {
      const parts = [];
      for await (const c of req) parts.push(c);
      (fake.storage[bucket] ||= {})[rest.join('/')] = Buffer.concat(parts);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return;
    }
    const pdf = fake.storage[bucket]?.[rest.join('/')];
    if (!pdf) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'content-type': 'application/pdf' }); res.end(pdf); return;
  }
  if (u.pathname.startsWith('/api/')) {
    const name = u.pathname.slice(5).replace(/[^a-z-]/g, '');
    try {
      const mod = await import(`${ROOT}/api/${name}.js`);
      let body;
      const chunks = [];
      for await (const c of req) chunks.push(c);
      if (chunks.length) { try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = {}; } }
      const out = {
        statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, getHeader() {},
        status(c) { this.statusCode = c; return this; },
        json(b) { res.writeHead(this.statusCode, { ...this.headers, 'content-type': 'application/json' }); res.end(JSON.stringify(b).replaceAll('https://fake.supabase.test/storage/v1/object/sign/', `http://localhost:${PORT}/__storage/`).replaceAll('https://fake.supabase.test/storage/v1/object/upload/sign/', `http://localhost:${PORT}/__storage/upload/`)); return this; },
        end(b) { res.writeHead(this.statusCode, this.headers); res.end(b); return this; },
      };
      await mod.default({ method: req.method, query: Object.fromEntries(u.searchParams), body, headers: req.headers, socket: req.socket, url: req.url }, out);
    } catch (e) {
      console.error(e);
      res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e.message) }));
    }
    return;
  }
  const file = u.pathname === '/admin' ? '/admin.html' : u.pathname;
  const full = path.join(ROOT, path.normalize(file));
  if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(PORT, () => console.log(`Panel de pruebas (datos falsos) en http://localhost:${PORT}/admin  ·  contraseña: secret-pass`));
