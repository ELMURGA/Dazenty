// GET /api/get-doc?slug=xxx&type=proposal|invoice
// Genera una URL firmada temporal para acceder al PDF del cliente
// No requiere autenticación: el slug es el identificador del portal

// Normalizar SB_URL: quitar barra final para evitar URLs con //
const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = 'client-docs';
const SLUG_RE = /^[a-z0-9-]+$/;

// Extrae el path de storage a partir de distintos formatos:
// - "slug/proposal-123.pdf"              → "slug/proposal-123.pdf"
// - "https://xxx.supabase.co/storage/v1/object/public/client-docs/slug/proposal-123.pdf"
// - "https://xxx.supabase.co/storage/v1/object/sign/client-docs/slug/proposal-123.pdf?token=..."
function extractPath(value) {
  if (!value) return null;
  const publicMarker = `/object/public/${BUCKET}/`;
  const signMarker   = `/object/sign/${BUCKET}/`;
  if (value.includes(publicMarker)) {
    // Quitar también query params o fragmentos que pudieran venir pegados
    return value.split(publicMarker)[1].split('?')[0].split('#')[0];
  }
  if (value.includes(signMarker)) {
    return value.split(signMarker)[1].split('?')[0].split('#')[0];
  }
  // Asumimos que ya es un path relativo; limpiar barra inicial si existe
  if (!value.startsWith('http')) return value.replace(/^\/+/, '');
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dazenty.com');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Configuración incompleta' });

  const { slug, type } = req.query;

  if (!slug || !SLUG_RE.test(slug)) return res.status(400).json({ error: 'Parámetro slug inválido' });
  if (!['proposal', 'invoice'].includes(type)) return res.status(400).json({ error: 'Parámetro type inválido' });

  // Obtener cliente
  const sbRes = await fetch(
    `${SB_URL}/rest/v1/clients?slug=eq.${encodeURIComponent(slug)}&select=status,pdf_proposal_url,pdf_invoice_url&limit=1`,
    { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
  );
  if (!sbRes.ok) return res.status(500).json({ error: 'Error al consultar la base de datos' });

  const clients = await sbRes.json();
  const client  = clients?.[0];
  if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
  if (client.status !== 'active') return res.status(403).json({ error: 'Portal no disponible' });

  const storedValue = type === 'proposal' ? client.pdf_proposal_url : client.pdf_invoice_url;
  if (!storedValue) return res.status(404).json({ error: 'Documento no disponible' });

  const path = extractPath(storedValue);
  console.log('[get-doc] storedValue:', storedValue, '| extractedPath:', path, '| bucket:', BUCKET);
  if (!path) return res.status(400).json({ error: 'Ruta de archivo inválida', debug: storedValue });

  // Verificar que el archivo existe en Storage antes de intentar firmarlo
  const infoRes = await fetch(
    `${SB_URL}/storage/v1/object/info/authenticated/${BUCKET}/${path}`,
    { headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` } }
  );
  if (!infoRes.ok) {
    const infoErr = await infoRes.json().catch(() => ({}));
    console.error('[get-doc] Archivo no encontrado en Storage:', infoRes.status, JSON.stringify(infoErr), '| path:', path, '| bucket:', BUCKET);
    return res.status(404).json({ error: 'Archivo no encontrado en Storage', debug: { path, bucket: BUCKET, status: infoRes.status, detail: infoErr } });
  }
  console.log('[get-doc] Archivo confirmado en Storage, generando URL firmada...');

  // Generar URL firmada válida 1 hora
  const signRes = await fetch(
    `${SB_URL}/storage/v1/object/sign/${BUCKET}/${path}`,
    {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    }
  );

  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    const msg = err.error || err.message || 'Error desconocido';
    console.error('[get-doc] Error generando URL firmada:', msg, '| path:', path);
    return res.status(502).json({ error: `No se pudo generar el acceso al documento: ${msg}` });
  }

  const body = await signRes.json();
  const signedURL = body.signedURL || body.signedUrl;
  if (!signedURL) {
    console.error('[get-doc] Supabase no devolvió signedURL. Respuesta:', body);
    return res.status(502).json({ error: 'URL firmada no recibida' });
  }

  // signedURL empieza con /storage/v1/... — lo anteponemos al base URL sin barra extra
  const finalURL = signedURL.startsWith('http') ? signedURL : `${SB_URL}${signedURL}`;
  return res.redirect(302, finalURL);
}
