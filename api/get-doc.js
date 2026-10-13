// GET /api/get-doc?slug=xxx&t=TOKEN&type=proposal|invoice
// Redirige a una URL firmada de corta duración del PDF del cliente.
// Requiere el token secreto del portal: el slug solo no da acceso.

import { SB_URL, SB_KEY, loadPortalClient, signedDocUrl, docPath } from '../lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://dazenty.com');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: 'Configuración incompleta' });

  const { slug, t, type } = req.query;
  if (!['proposal', 'invoice'].includes(type)) return res.status(400).json({ error: 'Parámetro type inválido' });

  const { client, status, error } = await loadPortalClient(slug, t, 'pdf_proposal_url,pdf_invoice_url');
  if (!client) return res.status(status).json({ error });

  const storedValue = type === 'proposal' ? client.pdf_proposal_url : client.pdf_invoice_url;
  if (!storedValue) return res.status(404).json({ error: 'Documento no disponible' });

  const path = docPath(storedValue);
  // El documento tiene que estar en la carpeta de este cliente
  if (!path || path.includes('..') || !path.startsWith(`${client.slug}/`)) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }

  const url = await signedDocUrl(path, 300);
  if (!url) return res.status(502).json({ error: 'No se pudo generar el enlace al documento' });
  return res.redirect(302, url);
}
