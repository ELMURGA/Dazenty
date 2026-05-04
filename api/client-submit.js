// api/client-submit.js — El cliente envía su información de contacto
// ==========================================================
// POST /api/client-submit
// Body JSON: { slug, name, company, phone, email, web, notes }
//
// Acciones:
//  1. Guarda los datos en el registro de Supabase del cliente
//  2. Envía email de notificación al admin via Resend
// ==========================================================

const SB_URL   = process.env.SUPABASE_URL;
const SB_KEY   = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = 'designerazenty@gmail.com';

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Validación básica de email
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { slug, name, company, phone, email, web, notes } = req.body ?? {};

  // Validaciones en frontera del sistema
  if (!slug || !name || !email) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: slug, name, email' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'El correo electrónico no es válido' });
  }
  // Evitar slugs con caracteres peligrosos
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Petición inválida' });
  }

  // 1. Actualizar el registro del cliente en Supabase
  try {
    await fetch(`${SB_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        client_contact_name:  String(name).slice(0, 200),
        client_contact_email: String(email).slice(0, 200),
        client_contact_phone: String(phone || '').slice(0, 50),
        client_contact_web:   String(web || '').slice(0, 500),
        client_notes:         String(notes || '').slice(0, 2000),
        client_submitted_at:  new Date().toISOString(),
        updated_at:           new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('[client-submit] Supabase error:', err);
    // No bloqueamos — igual enviamos el email
  }

  // 2. Enviar email de notificación al admin
  try {
    const emailHtml = `
      <div style="font-family:'Segoe UI',sans-serif;background:#050505;padding:32px;border-radius:12px;max-width:560px;margin:0 auto">
        <h2 style="color:#d97762;font-family:'Space Grotesk',sans-serif;margin-bottom:24px;font-size:22px">
          📋 Nuevo cliente ha enviado su información
        </h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px;width:140px">Slug / Portal</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">${esc(slug)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Nombre</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">${esc(name)}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Empresa</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">${esc(company || '—')}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Teléfono</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">${esc(phone || '—')}</td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Email</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px"><a href="mailto:${esc(email)}" style="color:#d97762">${esc(email)}</a></td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#888;font-size:13px">Web actual</td>
              <td style="padding:10px 0;border-bottom:1px solid #1e1e1e;color:#eaeaea;font-size:14px">${esc(web || '—')}</td></tr>
          <tr><td style="padding:10px 0;color:#888;font-size:13px;vertical-align:top">Notas</td>
              <td style="padding:10px 0;color:#eaeaea;font-size:14px;white-space:pre-wrap">${esc(notes || '—')}</td></tr>
        </table>
        <p style="margin-top:24px;font-size:12px;color:#555">
          Portal: <a href="https://dazenty.com/portal?id=${esc(slug)}" style="color:#d97762">dazenty.com/portal?id=${esc(slug)}</a>
        </p>
      </div>
    `;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Dazenty Portal <noreply@dazenty.com>',
        to: [ADMIN_EMAIL],
        reply_to: email,
        subject: `📋 Nuevo cliente en portal — ${esc(name)} (${esc(slug)})`,
        html: emailHtml,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json().catch(() => ({}));
      console.error('[client-submit] Resend error:', err);
    }
  } catch (err) {
    console.error('[client-submit] Email error:', err);
  }

  return res.status(200).json({ ok: true });
}
