-- ============================================================
-- 007 — Bucket de documentos privado
-- ============================================================
-- APLICAR SOLO DESPUÉS de desplegar el código que sirve los PDF con URL firmada
-- (api/get-doc.js y api/invoice-pdfs.js). Con el código anterior, que redirige a
-- la URL pública, los clientes dejarían de poder abrir sus documentos.
update storage.buckets set public = false where id = 'client-docs';
