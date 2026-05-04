// POST /api/stripe-cancel — cancela una suscripción de Stripe al final del período actual
// Body: { slug: string }

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const RESEND_KEY        = process.env.RESEND_API_KEY;
const SB_URL            = process.env.SUPABASE_URL;
const SB_KEY            = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_EMAIL       = 'designerazenty@gmail.com';

const SLUG_RE = /^[a-z0-9-]+$/;

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(unixTs) {
  return new Date(unixTs * 1000).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dazenty.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Método no permitido' });

  // Validar variables de entorno
  if (!STRIPE_SECRET_KEY || !SB_URL || !SB_KEY) {
    return res.status(500).json({ error: 'Configuración incompleta en el servidor' });
  }

  const { slug } = req.body || {};
  if (!slug || !SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'Parámetro slug inválido' });
  }

  // ── 1. Obtener cliente de Supabase ────────────────────────────────────────
  const sbRes = await fetch(
    `${SB_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`,
    { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
  );
  if (!sbRes.ok) return res.status(500).json({ error: 'Error al consultar la base de datos' });

  const clients = await sbRes.json();
  const client  = clients?.[0];
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });

  const subscriptionId = client.stripe_subscription_id;
  if (!subscriptionId) {
    return res.status(400).json({ error: 'No hay suscripción activa para este cliente' });
  }
  if (client.stripe_subscription_status === 'canceling') {
    return res.status(400).json({ error: 'La suscripción ya está programada para cancelarse' });
  }

  // ── 2. Cancelar en Stripe (al final del período) ──────────────────────────
  const stripeRes = await fetch(
    `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'cancel_at_period_end=true',
    }
  );
  if (!stripeRes.ok) {
    const err = await stripeRes.json().catch(() => ({}));
    console.error('[stripe-cancel] Stripe error:', err);
    return res.status(500).json({ error: 'Error al comunicarse con Stripe' });
  }

  const subscription   = await stripeRes.json();
  const periodEnd      = subscription.current_period_end;
  const periodEndDate  = formatDate(periodEnd);

  // ── 3. Actualizar Supabase ─────────────────────────────────────────────────
  await fetch(
    `${SB_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        stripe_subscription_status: 'canceling',
        stripe_current_period_end:  periodEnd,
        updated_at: new Date().toISOString(),
      }),
    }
  ).catch(err => console.error('[stripe-cancel] Supabase PATCH error:', err));

  // ── 4. Enviar emails ───────────────────────────────────────────────────────
  const clientName  = client.client_name  || 'Cliente';
  const clientEmail = client.client_contact_email;
  const service     = client.service_name || 'Hosting Profesional';
  const amount      = client.amount_monthly
    ? `${client.amount_monthly} €/mes`
    : client.amount_annual
    ? `${client.amount_annual} €/año`
    : '—';

  // — Email al CLIENTE ——————————————————————————————————————————————————————
  const clientHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Cancelación de suscripción — Dazenty</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;padding:48px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

  <!-- LOGO -->
  <tr><td align="center" style="padding-bottom:36px">
    <img src="https://dazenty.com/img/logodazenty.webp" alt="Dazenty" height="34" style="height:34px;width:auto;display:block">
  </td></tr>

  <!-- CARD PRINCIPAL -->
  <tr><td style="background:#111111;border:1px solid #1e1e1e;border-radius:20px;overflow:hidden">
    <!-- Línea de acento superior -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="30%" style="height:3px;background:#111111"></td>
      <td width="40%" style="height:3px;background:#d97762"></td>
      <td width="30%" style="height:3px;background:#111111"></td>
    </tr></table>

    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:40px 36px">

      <!-- Etiqueta + Título -->
      <tr><td style="padding-bottom:6px">
        <p style="margin:0;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">Cancelación de suscripción</p>
      </td></tr>
      <tr><td style="padding-bottom:10px">
        <h1 style="margin:0;font-size:28px;color:#eaeaea;font-weight:700;line-height:1.2">Tu plan ha sido cancelado</h1>
      </td></tr>
      <tr><td style="padding-bottom:36px">
        <p style="margin:0;font-size:15px;color:#666;line-height:1.65">Hola, ${esc(clientName)}. Hemos recibido tu solicitud de cancelación. Tu web continuará activa hasta el final del período de facturación actual.</p>
      </td></tr>

      <!-- Fecha destacada -->
      <tr><td style="padding-bottom:32px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0a0a0a;border:1px solid #1e1e1e;border-radius:14px">
          <tr><td align="center" style="padding:28px 24px">
            <p style="margin:0 0 8px;font-size:11px;color:#555;letter-spacing:2px;text-transform:uppercase">Tu web permanecerá activa hasta</p>
            <p style="margin:0;font-size:26px;color:#eaeaea;font-weight:700;line-height:1.1">${esc(periodEndDate)}</p>
            <p style="margin:10px 0 0;font-size:13px;color:#444">Pasada esa fecha, no se realizará ningún cobro más.</p>
          </td></tr>
        </table>
      </td></tr>

      <!-- Detalle -->
      <tr><td style="padding-bottom:10px">
        <p style="margin:0 0 16px;font-size:11px;color:#d97762;letter-spacing:2.5px;text-transform:uppercase;font-weight:600">Resumen de la cancelación</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px;width:48%">Plan cancelado</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(service)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Importe</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(amount)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;color:#555;font-size:13px">Activo hasta</td>
            <td style="padding:11px 0;color:#ccc;font-size:13px;text-align:right">${esc(periodEndDate)}</td>
          </tr>
        </table>
      </td></tr>

      <!-- Mensaje informativo -->
      <tr><td style="padding-top:28px;padding-bottom:32px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d0d;border:1px solid #1e1e1e;border-radius:12px">
          <tr><td style="padding:20px 22px">
            <p style="margin:0 0 8px;font-size:13px;color:#888;line-height:1.6">Si has cancelado por error o cambias de opinión, puedes escribirnos antes del <strong style="color:#eaeaea">${esc(periodEndDate)}</strong> y reactivamos tu plan sin coste adicional.</p>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA WhatsApp -->
      <tr><td style="padding-bottom:8px">
        <a href="https://wa.me/34624903256" style="display:block;background:#d97762;color:#050505;text-decoration:none;text-align:center;padding:15px 24px;border-radius:12px;font-weight:700;font-size:14px;letter-spacing:0.3px">
          ¿Quieres reactivar tu plan? Escríbenos por WhatsApp
        </a>
      </td></tr>

    </table>
  </td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="padding:32px 0 0">
    <p style="margin:0 0 6px;font-size:12px;color:#333">© 2026 Dazenty &nbsp;·&nbsp; <a href="https://dazenty.com" style="color:#555;text-decoration:none">dazenty.com</a> &nbsp;·&nbsp; <a href="mailto:hola@dazenty.com" style="color:#555;text-decoration:none">hola@dazenty.com</a></p>
    <p style="margin:0;font-size:11px;color:#2a2a2a">Stripe cancelará el cobro automático a partir de la fecha indicada.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  // — Email al ADMIN ————————————————————————————————————————————————————————
  const adminHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Cancelación de suscripción — Dazenty</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050505;padding:40px 16px">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

  <tr><td align="center" style="padding-bottom:28px">
    <img src="https://dazenty.com/img/logodazenty.webp" alt="Dazenty" height="30" style="height:30px;width:auto;display:block">
  </td></tr>

  <tr><td style="background:#111111;border:1px solid #1e1e1e;border-radius:16px;overflow:hidden">
    <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="25%" style="height:3px;background:#111"></td>
      <td width="50%" style="height:3px;background:#d97762"></td>
      <td width="25%" style="height:3px;background:#111"></td>
    </tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px">
      <tr><td style="padding-bottom:4px">
        <p style="margin:0;font-size:11px;color:#d97762;letter-spacing:2px;text-transform:uppercase;font-weight:600">Cancelación de suscripción</p>
      </td></tr>
      <tr><td style="padding-bottom:28px">
        <h1 style="margin:0;font-size:22px;color:#eaeaea;font-weight:700">Un cliente ha cancelado su suscripción</h1>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px;width:45%">Cliente</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(clientName)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Email</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;font-size:13px;text-align:right"><a href="mailto:${esc(clientEmail)}" style="color:#d97762;text-decoration:none">${esc(clientEmail)}</a></td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Servicio</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px;text-align:right">${esc(service)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Importe</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#d97762;font-size:16px;font-weight:700;text-align:right">${esc(amount)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#555;font-size:13px">Activo hasta</td>
            <td style="padding:11px 0;border-bottom:1px solid #1a1a1a;color:#eaeaea;font-size:13px;font-weight:600;text-align:right">${esc(periodEndDate)}</td>
          </tr>
          <tr>
            <td style="padding:11px 0;color:#444;font-size:12px">ID Suscripción</td>
            <td style="padding:11px 0;color:#333;font-size:11px;text-align:right;font-family:'Courier New',monospace">${esc(subscriptionId)}</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding-top:24px">
        <a href="https://dashboard.stripe.com/subscriptions/${esc(subscriptionId)}" style="display:inline-block;border:1px solid #2a2a2a;color:#888;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:13px">
          Ver suscripción en Stripe →
        </a>
      </td></tr>
    </table>
  </td></tr>

  <tr><td align="center" style="padding:24px 0 0">
    <p style="margin:0;font-size:11px;color:#2a2a2a">Dazenty · Notificación automática</p>
  </td></tr>

</table>
</td></tr>
</table>
</body></html>`;

  const sends = [];

  if (clientEmail) {
    sends.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Dazenty <noreply@dazenty.com>',
          to: [clientEmail],
          subject: `Tu suscripción ha sido cancelada — activa hasta el ${periodEndDate}`,
          html: clientHtml,
        }),
      }).then(async r => {
        if (!r.ok) console.error('[stripe-cancel] Error email cliente:', await r.json().catch(() => ({})));
      })
    );
  }

  sends.push(
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Dazenty <noreply@dazenty.com>',
        to: [ADMIN_EMAIL],
        subject: `Cancelación: ${clientName} — activo hasta ${periodEndDate}`,
        html: adminHtml,
      }),
    }).then(async r => {
      if (!r.ok) console.error('[stripe-cancel] Error email admin:', await r.json().catch(() => ({})));
    })
  );

  await Promise.all(sends).catch(err => console.error('[stripe-cancel] Error envío emails:', err));

  return res.status(200).json({
    ok: true,
    active_until: periodEndDate,
    period_end_ts: periodEnd,
  });
}
