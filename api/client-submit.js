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
    const emailHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Nuevo contacto — Dazenty</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;padding:48px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

  <!-- LOGO -->
  <tr><td align="center" style="padding-bottom:32px">
    <img src="https://dazenty.com/img/logodazenty.webp" alt="Dazenty" height="32" style="height:32px;width:auto;display:block">
  </td></tr>

  <!-- CARD -->
  <tr><td style="background:#111111;border:1px solid #1e1e1e;border-radius:20px;overflow:hidden">
    <!-- Línea de acento -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="25%" style="height:3px;background:#111"></td>
      <td width="50%" style="height:3px;background:#d97762"></td>
      <td width="25%" style="height:3px;background:#111"></td>
    </tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:36px">

      <!-- Título -->
      <tr><td style="padding-bottom:6px">
        <p style="margin:0;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">📋 Nuevo contacto</p>
      </td></tr>
      <tr><td style="padding-bottom:10px">
        <h1 style="margin:0;font-size:26px;color:#eaeaea;font-weight:700;line-height:1.2">Un cliente ha enviado su información</h1>
      </td></tr>
      <tr><td style="padding-bottom:32px">
        <p style="margin:0;font-size:14px;color:#555;line-height:1.6">Portal: <a href="https://dazenty.com/portal?id=${esc(slug)}" style="color:#d97762;text-decoration:none">dazenty.com/portal?id=${esc(slug)}</a></p>
      </td></tr>

      <!-- Datos del cliente -->
      <tr><td style="padding-bottom:20px">
        <p style="margin:0 0 16px;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">Datos de contacto</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px;width:42%">Nombre</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#eaeaea;font-size:13px;text-align:right;font-weight:600">${esc(name)}</td>
          </tr>
          ${company ? `<tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Empresa</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(company)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Email</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;font-size:13px;text-align:right"><a href="mailto:${esc(email)}" style="color:#d97762;text-decoration:none">${esc(email)}</a></td>
          </tr>
          ${phone ? `<tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Teléfono</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;font-size:13px;text-align:right"><a href="tel:${esc(phone)}" style="color:#d97762;text-decoration:none">${esc(phone)}</a></td>
          </tr>` : ''}
          ${web ? `<tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Web actual</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(web)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:11px 0;color:#444;font-size:12px">Slug / Portal</td>
            <td style="padding:11px 0;color:#555;font-size:12px;text-align:right;font-family:'Courier New',monospace">${esc(slug)}</td>
          </tr>
        </table>
      </td></tr>

      <!-- Notas (si las hay) -->
      ${notes ? `<tr><td style="padding-bottom:28px">
        <p style="margin:0 0 10px;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">Notas del cliente</p>
        <div style="background:#0a0a0a;border:1px solid #1e1e1e;border-radius:10px;padding:16px">
          <p style="margin:0;font-size:13px;color:#888;line-height:1.65;white-space:pre-wrap">${esc(notes)}</p>
        </div>
      </td></tr>` : ''}

      <!-- CTAs de respuesta -->
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-right:8px" width="50%">
              <a href="https://wa.me/34624903256?text=Hola%20${encodeURIComponent(String(name).split(' ')[0])}%2C%20soy%20Dazenty.%20He%20recibido%20tu%20información%20y%20me%20pongo%20en%20contacto%20contigo%20ahora." style="display:block;background:#d97762;color:#050505;text-decoration:none;text-align:center;padding:13px 16px;border-radius:10px;font-weight:700;font-size:13px">
                Responder por WhatsApp →
              </a>
            </td>
            <td width="50%">
              <a href="mailto:${esc(email)}?subject=Tu portal Dazenty — ${esc(slug)}" style="display:block;background:transparent;color:#888;text-decoration:none;text-align:center;padding:13px 16px;border-radius:10px;font-weight:600;font-size:13px;border:1px solid #2a2a2a">
                Responder por email →
              </a>
            </td>
          </tr>
        </table>
      </td></tr>

    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="padding:28px 0 0">
    <p style="margin:0;font-size:11px;color:#2a2a2a">Dazenty · Notificación automática del portal</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

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
        subject: `📋 Nuevo contacto — ${esc(name)}${company ? ' · ' + esc(company) : ''} (${esc(slug)})`,
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
