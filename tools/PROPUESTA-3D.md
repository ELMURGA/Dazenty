# Propuesta 3D para dazenty.com

Rama: `web-3d` (solo análisis, nada implementado ni publicado).

## Cómo está la web hoy

- Hero con tres líneas de texto enormes ("Ideas que / Transforman / Realidades") sobre dos manchas de color desenfocadas. Es limpio, pero **no hay ningún elemento que se mueva con el usuario**.
- Servicios (nuevo): tarjetas que giran en 3D con CSS.
- Trabajos recientes: capturas planas en rejilla.
- Cómo trabajamos: pasos en lista.
- Reseñas: slider.
- Contacto: formulario.
- Stack: HTML + Tailwind + JS ligero. Lenis solo en escritorio. Sin WebGL. Todo el peso de la página es bajo, y conviene mantenerlo así.

## Ideas, ordenadas por impacto / esfuerzo

| # | Dónde | Qué | Tecnología | Impacto | Esfuerzo |
|---|-------|-----|-----------|---------|----------|
| 1 | Hero | Una forma 3D de partículas o malla en coral (#d97762) que **se deforma siguiendo el cursor** y se transforma de esfera a cubo a medida que se baja ("ideas → realidades"). Es lo primero que ve el cliente. | Three.js, carga diferida | Muy alto | Medio |
| 2 | Trabajos recientes | Las capturas de las webs como **ventanas de navegador flotando en 3D** que se inclinan con el ratón y se desplazan en profundidad con el scroll. | CSS 3D (`perspective`, `translateZ`), sin WebGL | Alto | Bajo |
| 3 | Cómo trabajamos | Una **hélice o camino 3D** que avanza con el scroll y se detiene en cada uno de los cuatro pasos. | Three.js o SVG con CSS 3D | Medio-alto | Medio |
| 4 | Servicios | Iconos 3D de baja poligonación (uno por servicio) que giran suavemente tras la tarjeta. | Three.js o modelos `.glb` ligeros | Medio | Medio |
| 5 | Fondo global | Campo de partículas sutil que reacciona al scroll en toda la página. | Three.js (un solo canvas fijo) | Medio | Bajo |
| 6 | Página de cada servicio | Un objeto 3D distinto en el hero de cada servicio (navegador, engranajes, burbuja de chat, nodos conectados…). | Three.js | Alto | Alto |

## Recomendación

Empezar por **#1 (hero)** y **#2 (trabajos)**:

- #1 da el efecto "wow" inmediato al entrar.
- #2 refuerza lo que más vende (el portfolio) y casi no pesa, porque es CSS.
- Dejar #3 y #6 para una segunda fase si gustan.

## Reglas para que no estropee la web

- **Carga diferida:** Three.js (~150 KB comprimido) solo se descarga tras pintar la página, nunca antes.
- **Solo donde aporta:** en móviles, ahorro de datos o `prefers-reduced-motion`, se muestra una imagen estática o la versión CSS (hoy la web ya hace esto con Lenis).
- **Se pausa fuera de pantalla** (`IntersectionObserver`) y respeta el límite de 60 fps.
- **Texto siempre real y legible**; el 3D es decoración, no sustituye al contenido ni a los enlaces (SEO y accesibilidad intactos).
- **Presupuesto de rendimiento:** no empeorar LCP ni CLS; se medirá antes y después con Lighthouse.

## Siguiente paso

Elegir cuáles prototipar. Cada prototipo se haría en esta rama, se abriría en local para revisarlo y no se publicaría hasta que lo apruebes.
