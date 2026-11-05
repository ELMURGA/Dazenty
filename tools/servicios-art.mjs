// Ilustraciones de cada servicio: fragmentos de interfaz dibujados en SVG con la paleta de Dazenty.
// Colores planos, sin degradados ni sombras. Cada pieza es 800 x 600.

const C = '#d97762';      // coral de marca
const C2 = '#8f4a3b';     // coral oscuro (plano)
const BG = '#171717';     // campo
const P1 = '#222222';     // panel
const P2 = '#2d2d2d';     // panel claro
const INK = '#f4f4f4';
const MUTE = '#8d8d8d';
const LIGHT = '#eaeaea';

const r = (x, y, w, h, fill, rx = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const t = (x, y, s, size, fill = INK, w = 500, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="Inter, sans-serif" font-size="${size}" font-weight="${w}" fill="${fill}" text-anchor="${anchor}">${s}</text>`;
const td = (x, y, s, size, fill = INK, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="Space Grotesk, sans-serif" font-size="${size}" font-weight="700" fill="${fill}" letter-spacing="-1" text-anchor="${anchor}">${s}</text>`;
const c = (x, y, rad, fill) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${fill}"/>`;
const wrap = (inner, label) => `<svg viewBox="0 0 800 600" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${r(0, 0, 800, 600, BG)}${inner}</svg>`;

// Código QR de adorno determinista (no apunta a nada real)
const qr = (x, y, size) => {
  const n = 21, cell = size / n; let out = r(x, y, size, size, LIGHT);
  const finder = (fx, fy) => r(x + fx * cell, y + fy * cell, 7 * cell, 7 * cell, '#111') + r(x + (fx + 1) * cell, y + (fy + 1) * cell, 5 * cell, 5 * cell, LIGHT) + r(x + (fx + 2) * cell, y + (fy + 2) * cell, 3 * cell, 3 * cell, '#111');
  out += finder(0, 0) + finder(14, 0) + finder(0, 14);
  let s = 7;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const inFinder = (i < 8 && j < 8) || (i > 12 && j < 8) || (i < 8 && j > 12);
    s = (s * 73 + 11) % 97;
    if (!inFinder && s % 3 === 0) out += r(x + i * cell, y + j * cell, cell, cell, '#111');
  }
  return out;
};

const phone = (x, y, w, h, inner) =>
  r(x, y, w, h, '#0b0b0b', 34) + r(x + 8, y + 8, w - 16, h - 16, P1, 28) + inner;

export const ART = {
  'diseno-web': wrap(
    r(70, 80, 560, 380, P1, 14) + r(70, 80, 560, 44, P2, 14) + r(70, 110, 560, 14, P2) +
    c(96, 102, 6, C) + c(116, 102, 6, MUTE) + c(136, 102, 6, MUTE) +
    td(110, 210, 'Tu clínica,', 46) + td(110, 262, 'sin esperas.', 46, C) +
    t(110, 300, 'Reserva tu cita en un minuto.', 18, MUTE) +
    r(110, 326, 168, 48, C, 24) + t(194, 357, 'Pedir cita', 17, '#111', 700, 'middle') +
    r(400, 160, 200, 260, C2, 12) + r(420, 180, 160, 100, C, 8) + r(420, 296, 120, 12, P1, 6) + r(420, 320, 160, 12, P1, 6) + r(420, 344, 90, 12, P1, 6) +
    phone(540, 200, 200, 370, r(560, 236, 160, 22, P2, 6) + td(560, 306, 'Tu clínica,', 24) + td(560, 336, 'sin esperas.', 24, C) + r(560, 362, 112, 34, C, 17) + t(616, 385, 'Pedir cita', 13, '#111', 700, 'middle') + r(560, 420, 160, 90, C2, 8)),
    'Web de una clínica vista en ordenador y en móvil'),

  'software-a-medida': wrap(
    r(60, 70, 680, 460, P1, 14) + r(60, 70, 150, 460, '#1b1b1b', 14) + r(180, 70, 30, 460, '#1b1b1b') +
    td(84, 112, 'Gestión', 22) + t(84, 160, 'Clientes', 15, INK, 600) + r(74, 144, 4, 24, C) + t(84, 196, 'Proyectos', 15, MUTE) + t(84, 232, 'Facturas', 15, MUTE) + t(84, 268, 'Tareas', 15, MUTE) +
    td(240, 118, 'Clientes activos', 28) + r(560, 92, 150, 40, C, 20) + t(635, 118, '+ Nuevo cliente', 15, '#111', 700, 'middle') +
    r(240, 160, 470, 44, P2, 8) + t(258, 188, 'Cliente', 14, MUTE) + t(430, 188, 'Proyecto', 14, MUTE) + t(560, 188, 'Estado', 14, MUTE) +
    t(258, 238, 'Bodegas Acosta', 16, INK, 600) + t(430, 238, 'Web + tienda', 16) + r(560, 220, 96, 28, C, 14) + t(608, 240, 'En curso', 13, '#111', 700, 'middle') +
    t(258, 292, 'Clínica Marín', 16, INK, 600) + t(430, 292, 'Automatización', 16) + r(560, 274, 96, 28, P2, 14) + t(608, 294, 'Revisión', 13, INK, 600, 'middle') +
    t(258, 346, 'Taller JC', 16, INK, 600) + t(430, 346, 'Web corporativa', 16) + r(560, 328, 96, 28, P2, 14) + t(608, 348, 'Entregado', 13, INK, 600, 'middle') +
    t(258, 400, 'Pinturas Merpa', 16, INK, 600) + t(430, 400, 'SEO local', 16) + r(560, 382, 96, 28, C, 14) + t(608, 402, 'En curso', 13, '#111', 700, 'middle') +
    r(240, 440, 470, 62, C2, 10) + t(262, 477, 'Próxima factura: viernes · Aviso automático al cliente', 15, INK, 600),
    'Panel de gestión de clientes y proyectos'),

  'agentes-ia': wrap(
    r(150, 50, 500, 500, P1, 18) + r(150, 50, 500, 74, P2, 18) + r(150, 100, 500, 24, P2) +
    c(190, 87, 20, C) + t(222, 82, 'Asistente de Casa Lola', 17, INK, 700) + t(222, 104, 'Responde ahora', 13, MUTE) +
    r(180, 150, 290, 52, P2, 22) + t(200, 182, '¿Tenéis hueco el sábado?', 16) +
    r(300, 222, 320, 92, C, 22) + t(320, 254, 'Sí. A las 13:30 o a las 21:00.', 16, '#111', 600) + t(320, 282, '¿Para cuántas personas?', 16, '#111', 600) +
    r(540, 334, 80, 48, P2, 22) + t(580, 366, 'Cuatro', 16, INK, 500, 'middle') +
    r(180, 402, 340, 92, C, 22) + t(200, 434, 'Reservado para el sábado a las 21:00.', 16, '#111', 600) + t(200, 462, 'Te llega la confirmación al móvil.', 16, '#111', 600) +
    r(180, 508, 380, 28, P2, 14) + t(196, 528, 'Escribe tu mensaje…', 13, MUTE),
    'Conversación de un asistente de IA reservando una mesa'),

  automatizaciones: wrap(
    `<path d="M250 300 C 330 300, 330 180, 410 180" stroke="${C}" stroke-width="4" fill="none"/>` +
    `<path d="M250 300 C 330 300, 330 420, 410 420" stroke="${C}" stroke-width="4" fill="none"/>` +
    `<path d="M570 180 L 640 180" stroke="${C}" stroke-width="4" fill="none"/>` +
    `<path d="M570 420 L 640 420" stroke="${C}" stroke-width="4" fill="none"/>` +
    r(70, 260, 180, 80, P1, 14) + t(160, 296, 'Formulario', 18, INK, 700, 'middle') + t(160, 322, 'llega un contacto', 13, MUTE, 500, 'middle') +
    r(410, 140, 160, 80, P1, 14) + t(490, 176, 'Hoja de datos', 18, INK, 700, 'middle') + t(490, 202, 'se registra solo', 13, MUTE, 500, 'middle') +
    r(410, 380, 160, 80, P1, 14) + t(490, 416, 'Respuesta IA', 18, INK, 700, 'middle') + t(490, 442, 'borrador al cliente', 13, MUTE, 500, 'middle') +
    r(640, 140, 110, 80, C, 14) + t(695, 176, 'Aviso', 18, '#111', 700, 'middle') + t(695, 202, 'al móvil', 13, '#111', 500, 'middle') +
    r(640, 380, 110, 80, C, 14) + t(695, 416, 'CRM', 18, '#111', 700, 'middle') + t(695, 442, 'actualizado', 13, '#111', 500, 'middle') +
    c(250, 300, 8, C) + c(410, 180, 8, C) + c(410, 420, 8, C) + c(570, 180, 8, C) + c(570, 420, 8, C),
    'Flujo automático: formulario, hoja de datos, aviso y CRM'),

  'diseno-grafico': wrap(
    r(60, 60, 400, 480, C, 10) + c(260, 260, 120, '#111') + c(260, 260, 120, '#111') + `<path d="M260 140 A120 120 0 0 1 380 260 L260 260 Z" fill="${LIGHT}"/>` + r(140, 420, 240, 14, '#111', 7) + td(260, 480, 'Marca', 46, '#111', 'middle') +
    r(480, 60, 260, 150, LIGHT, 10) + c(540, 135, 34, '#111') + `<path d="M540 101 A34 34 0 0 1 574 135 L540 135 Z" fill="${C}"/>` + td(668, 148, 'Marca', 30, '#111', 'middle') +
    r(480, 230, 260, 150, '#0a0a0a', 10) + c(540, 305, 34, INK) + `<path d="M540 271 A34 34 0 0 1 574 305 L540 305 Z" fill="${C}"/>` + td(668, 318, 'Marca', 30, INK, 'middle') +
    r(480, 400, 80, 140, C, 10) + r(570, 400, 80, 140, LIGHT, 10) + r(660, 400, 80, 140, '#0a0a0a', 10) + td(520, 520, 'Aa', 30, '#111', 'middle') + td(610, 520, 'Aa', 30, '#111', 'middle') + td(700, 520, 'Aa', 30, INK, 'middle'),
    'Identidad visual: logotipo, variantes, colores y tipografía'),

  'redes-sociales': wrap(
    phone(240, 30, 320, 540,
      c(290, 104, 22, C) + t(324, 100, 'tunegocio', 17, INK, 700) + t(324, 120, 'Sevilla', 13, MUTE) +
      r(266, 150, 268, 268, C, 6) + td(300, 250, 'Menú de', 34, '#111') + td(300, 290, 'temporada', 34, '#111') + r(300, 330, 120, 40, '#111', 20) + t(360, 356, 'Reservar', 15, INK, 700, 'middle') +
      c(282, 450, 11, C) + c(322, 450, 11, P2) + c(362, 450, 11, P2) +
      r(266, 480, 150, 12, P2, 6) + r(266, 504, 220, 12, P2, 6)) +
    r(600, 120, 150, 70, C, 12) + t(675, 150, 'Alcance', 14, '#111', 600, 'middle') + td(675, 178, '+38 %', 28, '#111', 'middle') +
    r(60, 380, 160, 70, P1, 12) + t(140, 410, 'Mensajes', 14, MUTE, 500, 'middle') + td(140, 438, '27', 28, INK, 'middle') +
    r(600, 340, 150, 70, P1, 12) + t(675, 370, 'Reservas', 14, MUTE, 500, 'middle') + td(675, 398, '12', 28, INK, 'middle') +
    r(60, 160, 140, 90, P1, 12) + t(130, 196, 'Lun · Reel', 14, INK, 600, 'middle') + t(130, 222, 'Jue · Carrusel', 14, MUTE, 500, 'middle'),
    'Perfil de redes sociales con resultados de campaña'),

  'seo-local': wrap(
    r(70, 60, 660, 56, P1, 28) + `<circle cx="108" cy="88" r="9" fill="none" stroke="${MUTE}" stroke-width="3"/><path d="M115 95 L123 103" stroke="${MUTE}" stroke-width="3"/>` + t(140, 94, 'clínica dental tomares', 18, INK, 500) +
    r(70, 140, 330, 390, C2, 14) + r(70, 140, 330, 390, C2, 14) +
    `<path d="M70 300 L400 250 M180 140 L230 530 M70 430 L400 380 M300 140 L280 530" stroke="${C}" stroke-width="10" opacity="1" fill="none"/>` +
    c(200, 330, 20, INK) + c(200, 330, 8, C) + c(320, 220, 14, C) + c(130, 440, 14, C) +
    r(430, 140, 300, 120, P1, 12) + t(452, 178, 'Clínica Dental Sol', 20, INK, 700) + t(452, 206, '4,9 · Dentista · Tomares', 15, MUTE) + t(452, 234, 'Abierto hasta las 20:00', 15, C, 600) +
    r(430, 276, 300, 120, P1, 12) + t(452, 314, 'Dental Aljarafe', 20, INK, 700) + t(452, 342, '4,6 · Dentista · Camas', 15, MUTE) + t(452, 370, 'Cierra a las 19:00', 15, MUTE) +
    r(430, 412, 300, 118, P1, 12) + t(452, 450, 'Clínica Norte', 20, INK, 700) + t(452, 478, '4,4 · Dentista · Sevilla', 15, MUTE),
    'Resultados de Google y Maps con un negocio en primera posición'),

  'mantenimiento-web': wrap(
    r(110, 70, 580, 460, P1, 16) + td(150, 130, 'Estado de tu web', 30) + r(540, 100, 120, 40, C, 20) + t(600, 126, 'En línea', 16, '#111', 700, 'middle') +
    r(150, 170, 500, 70, P2, 12) + c(184, 205, 14, C) + `<path d="M177 205 L182 211 L192 199" stroke="#111" stroke-width="3" fill="none"/>` + t(214, 200, 'Certificado de seguridad', 17, INK, 700) + t(214, 224, 'Válido y renovado', 14, MUTE) +
    r(150, 256, 500, 70, P2, 12) + c(184, 291, 14, C) + `<path d="M177 291 L182 297 L192 285" stroke="#111" stroke-width="3" fill="none"/>` + t(214, 286, 'Copia de seguridad', 17, INK, 700) + t(214, 310, 'Hecha hoy a las 03:00', 14, MUTE) +
    r(150, 342, 500, 70, P2, 12) + c(184, 377, 14, C) + `<path d="M177 377 L182 383 L192 371" stroke="#111" stroke-width="3" fill="none"/>` + t(214, 372, 'Actualizaciones', 17, INK, 700) + t(214, 396, 'Todo al día', 14, MUTE) +
    r(150, 428, 500, 70, C2, 12) + t(176, 460, 'Último cambio: horario de verano actualizado', 16, INK, 600) + t(176, 484, 'Solicitado por WhatsApp · Resuelto el mismo día', 14, INK, 400),
    'Panel de estado y mantenimiento de una web'),

  'carta-qr-restaurantes': wrap(
    phone(70, 40, 300, 520,
      td(106, 118, 'Casa Lola', 30) + t(106, 144, 'Carta · Cocina andaluza', 14, MUTE) +
      t(106, 196, 'Arroz del día', 18, INK, 700) + t(334, 196, '14,50', 18, C, 700, 'end') + t(106, 218, 'Con marisco de la lonja', 13, MUTE) +
      t(106, 262, 'Presa ibérica', 18, INK, 700) + t(334, 262, '16,00', 18, C, 700, 'end') + t(106, 284, 'Patatas y pimientos', 13, MUTE) +
      t(106, 328, 'Tortillita de camarones', 18, INK, 700) + t(334, 328, '9,00', 18, C, 700, 'end') + t(106, 350, 'Ración para compartir', 13, MUTE) +
      t(106, 394, 'Tarta de queso', 18, INK, 700) + t(334, 394, '6,50', 18, C, 700, 'end') + t(106, 416, 'Hecha en casa', 13, MUTE) +
      r(106, 456, 228, 52, C, 26) + t(220, 488, 'Reservar mesa', 17, '#111', 700, 'middle')) +
    r(440, 120, 290, 360, C, 12) + r(470, 150, 230, 230, LIGHT, 8) + qr(485, 165, 200) + td(585, 430, 'Escanea la carta', 26, '#111', 'middle') + t(585, 458, 'Sin descargar nada', 15, '#111', 500, 'middle'),
    'Carta digital en el móvil y código QR para la mesa'),
};
