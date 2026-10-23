"""Genera la plantilla base de las facturas a partir del diseño "facturas" de Canva.

Uso (si cambia el diseño en Canva):
  1. Exporta UNA página del diseño "facturas" en PDF desde Canva.
  2. python3 tools/factura/build_template.py ruta/al/export.pdf
  3. Revisa img/factura/plantilla-factura.pdf y sube el ?v= de PLANTILLA_URL en js/invoice-pdf.js.

Quita del PDF de Canva solo los datos que cambian en cada factura (cliente, nº, fecha,
líneas, totales, contacto, datos de pago y la línea inferior). Todo lo demás (franja superior, logo, sello,
títulos y la cabecera de la tabla) queda tal cual lo exporta Canva. El panel rellena los
huecos con pdf-lib en js/invoice-pdf.js usando las mismas coordenadas.
Requiere PyMuPDF (pip install pymupdf).
"""
import sys
from pathlib import Path

import pymupdf

# Zonas a vaciar, en puntos con origen arriba a la izquierda (página A4 de Canva: 595.5 x 842.25)
REDACT = [
    (128, 230, 420, 284),   # valores de nombre, teléfono y dirección del cliente
    (390, 105, 540, 140),   # "Factura: Nº001" / "Fecha: 5 de Marzo del 2026"
    (55, 368, 540, 572),    # líneas de la tabla, sub-total, caja TOTAL y bloque de contacto
    (205, 700, 330, 736),   # valores de método de pago y estado
    (-200, 744, 330, 751),  # línea inferior: baja una fila cuando la factura lleva línea extra
]


def main(src: str) -> None:
    out = Path(__file__).resolve().parents[2] / 'img' / 'factura' / 'plantilla-factura.pdf'
    doc = pymupdf.open(src)
    page = doc[0]
    for rect in REDACT:
        page.add_redact_annot(pymupdf.Rect(*rect), fill=False)
    page.apply_redactions(
        images=pymupdf.PDF_REDACT_IMAGE_NONE,
        graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
        text=pymupdf.PDF_REDACT_TEXT_REMOVE,
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    doc.save(out, garbage=4, deflate=True)
    print(f'Plantilla guardada en {out}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Uso: python3 tools/factura/build_template.py export-canva.pdf')
    main(sys.argv[1])
