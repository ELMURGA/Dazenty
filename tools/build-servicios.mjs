// Genera las páginas de servicios y rellena los bloques marcados de index.html.
// Uso: node tools/build-servicios.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVICES, GOALS, SHOWCASE } from './servicios-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://dazenty.com';
const WA = 'https://wa.me/34624903256';
const CSS_V = '3';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n) => String(n).padStart(2, '0');
const svg = (d, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;
const ARROW = '<svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>';
const CHECK = 'M5 13l4 4L19 7';
const CROSS = 'M6 18L18 6M6 6l12 12';
const bySlug = Object.fromEntries(SERVICES.map((s) => [s.slug, s]));
const waLink = (text) => `${WA}?text=${encodeURIComponent(text)}`;

// ---------- Piezas compartidas ----------
const headerHtml = () => `<header class="site-header">
        <div class="site-header__inner">
            <a href="/" class="site-header__logo" aria-label="Dazenty — volver al inicio">
                <img src="/img/logoheader-160.webp" alt="Dazenty" width="160" height="160">
            </a>

            <nav class="site-header__nav" aria-label="Navegación principal">
                <a href="/#inicio">Inicio</a>
                <div class="nav-drop">
                    <a href="/servicios" aria-haspopup="true">Servicios</a>
                    <div class="nav-drop__panel">
                        <div class="nav-drop__box">
${SERVICES.map((s) => `                            <a href="/servicios/${s.slug}">${esc(s.name)}<small>${esc(s.short.split('.')[0].slice(0, 62))}…</small></a>`).join('\n')}
                            <a href="/servicios" class="nav-drop__all"><span>Ver todos los servicios</span><span aria-hidden="true">→</span></a>
                        </div>
                    </div>
                </div>
                <a href="/html/portfolio">Portfolio</a>
                <a href="/#contacto" class="site-header__cta">Hablemos</a>
            </nav>

            <button class="nav-toggle" id="nav-toggle" aria-label="Abrir menú" aria-expanded="false" aria-controls="mobile-nav">
                <span></span><span></span><span></span>
            </button>
        </div>
    </header>

    <div class="mobile-nav" id="mobile-nav">
        <a href="/#inicio">Inicio</a>
        <a href="/servicios">Servicios</a>
        <div class="mobile-nav__sub">
${SERVICES.map((s) => `            <a href="/servicios/${s.slug}" class="mobile-nav__small">${esc(s.name)}</a>`).join('\n')}
        </div>
        <a href="/html/portfolio">Portfolio</a>
        <a href="/#contacto" class="mobile-nav__cta">Hablemos</a>
    </div>`;

const cardHtml = (s, i) => `<li class="sv-item" data-goals="${s.goals.join(' ')}" data-search="${esc(`${s.name} ${s.short} ${s.keywords} ${s.bullets.join(' ')}`)}">
                        <div class="sv-card">
                            <button type="button" class="sv-face sv-front" aria-expanded="false" aria-label="${esc(s.name)}: ver detalles">
                                <span class="sv-num">${pad(i + 1)} / ${pad(SERVICES.length)}</span>
                                <span class="sv-icon">${svg(s.icon)}</span>
                                <h3 class="sv-title">${esc(s.name)}</h3>
                                <span class="sv-hint">Toca para ver</span>
                            </button>
                            <div class="sv-face sv-back">
                                <h3>${esc(s.name)}</h3>
                                <p>${esc(s.short)}</p>
                                <ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
                                <a class="sv-go" href="/servicios/${s.slug}" data-svc="${esc(s.name)}">Ver servicio ${ARROW}</a>
                            </div>
                        </div>
                    </li>`;

const gridHtml = () => `<ul class="sv-grid" aria-label="Servicios de Dazenty">
                    ${SERVICES.map(cardHtml).join('\n                    ')}
                </ul>`;

const footerHtml = () => `<footer class="bg-black py-12 border-t border-white/10">
        <div class="max-w-7xl mx-auto px-6">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
                <div class="col-span-2 md:col-span-1">
                    <div class="flex items-center gap-2 mb-4">
                        <img src="/img/logoheader-160.webp" alt="Dazenty" width="160" height="160" class="h-14 w-auto" loading="lazy" decoding="async">
                    </div>
                    <p class="text-gray-500 text-sm mb-4">Webs, software a medida y automatizaciones con IA.</p>
                </div>
                <div>
                    <h4 class="font-bold mb-4">Servicios</h4>
                    <ul class="space-y-2 text-sm text-gray-500">
${SERVICES.map((s) => `                        <li><a href="/servicios/${s.slug}" class="hover:text-brand-blue transition-colors">${esc(s.name)}</a></li>`).join('\n')}
                    </ul>
                </div>
                <div>
                    <h4 class="font-bold mb-4">Empresa</h4>
                    <ul class="space-y-2 text-sm text-gray-500">
                        <li><a href="/#nosotros" class="hover:text-brand-blue transition-colors">Nosotros</a></li>
                        <li><a href="/html/portfolio" class="hover:text-brand-blue transition-colors">Portfolio</a></li>
                        <li><a href="/#contacto" class="hover:text-brand-blue transition-colors">Contacto</a></li>
                    </ul>
                </div>
                <div>
                    <h4 class="font-bold mb-4">Legal</h4>
                    <ul class="space-y-2 text-sm text-gray-500">
                        <li><a href="/html/privacidad" class="hover:text-brand-blue transition-colors">Política de Privacidad</a></li>
                        <li><a href="/html/terminos" class="hover:text-brand-blue transition-colors">Términos de Servicio</a></li>
                        <li><a href="/html/avisos-legales" class="hover:text-brand-blue transition-colors">Aviso Legal</a></li>
                    </ul>
                </div>
            </div>
            <div class="pt-8 border-t border-white/10 text-center text-gray-500 text-sm">
                <p>&copy; 2026 Dazenty. Todos los derechos reservados.</p>
            </div>
        </div>
    </footer>

    <a href="${WA}" target="_blank" rel="noopener noreferrer" class="whatsapp-float" aria-label="Contactar por WhatsApp">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    </a>`;

const head = ({ title, desc, path, ld }) => `<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <meta name="author" content="Dazenty">
    <meta name="robots" content="index, follow">
    <meta name="theme-color" content="#d97762">
    <link rel="icon" type="image/webp" href="/img/favicon.webp">
    <link rel="apple-touch-icon" href="/img/favicon.webp">
    <link rel="manifest" href="/manifest.json">
    <link rel="canonical" href="${SITE}${path}">

    <meta property="og:type" content="website">
    <meta property="og:url" content="${SITE}${path}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${SITE}/img/logodazenty.webp">
    <meta property="og:locale" content="es_ES">
    <meta property="og:site_name" content="Dazenty">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${SITE}/img/logodazenty.webp">

    <link rel="preload" href="/fonts/space-grotesk-latin-v22.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/inter-latin-v20.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/css/site.min.css?v=${CSS_V}">
    <script defer src="/js/cookies.js?v=1"></script>
    <script defer src="/js/analytics.js?v=2"></script>
    <script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
    </script>
</head>`;

const scripts = `    <script src="/js/main.js"></script>
    <script src="/js/servicios.js?v=1"></script>`;

// ---------- Página de servicio ----------
const servicePage = (s) => {
  const rel = s.related.map((r) => bySlug[r]).filter(Boolean);
  const ctaHref = `/?servicio=${encodeURIComponent(s.name)}#contacto`;
  const wa = waLink(`Hola, me interesa el servicio de ${s.name}. ¿Podemos hablar?`);
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: s.name,
      serviceType: s.name,
      description: s.metaDesc,
      provider: { '@type': 'Organization', name: 'Dazenty', url: `${SITE}/` },
      areaServed: 'ES',
      url: `${SITE}/servicios/${s.slug}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE}/` },
        { '@type': 'ListItem', position: 2, name: 'Servicios', item: `${SITE}/servicios` },
        { '@type': 'ListItem', position: 3, name: s.name, item: `${SITE}/servicios/${s.slug}` },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: s.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];

  const tiles = (arr, cls, mark) =>
    arr.map((x) => `<div class="sv-tile ${cls} sv-reveal"><span class="sv-tile__mark">${svg(mark)}</span><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></div>`).join('\n                    ');

  return `${head({ title: s.title, desc: s.metaDesc, path: `/servicios/${s.slug}`, ld })}

<body class="bg-brand-dark text-white overflow-x-hidden antialiased selection:bg-brand-blue selection:text-black sv-page">

    ${headerHtml()}

    <main>
        <section class="sv-hero">
            <div class="sv-hero__orb" aria-hidden="true"></div>
            <div class="sv-wrap" style="position:relative">
                <nav class="sv-crumbs" aria-label="Ruta"><a href="/">Inicio</a><span aria-hidden="true">/</span><a href="/servicios">Servicios</a><span aria-hidden="true">/</span><span aria-current="page">${esc(s.name)}</span></nav>
                <span class="sv-eyebrow">${esc(s.name)}</span>
                <h1>${esc(s.h1)}</h1>
                <p class="sv-hero__lead">${esc(s.lead)}</p>
                <div class="sv-hero__cta">
                    <a class="sv-btn sv-btn--primary" href="${ctaHref}">Pedir presupuesto ${ARROW.replace('<svg', '<svg width="16" height="16"')}</a>
                    <a class="sv-btn sv-btn--ghost" href="${wa}" target="_blank" rel="noopener noreferrer">Hablar por WhatsApp</a>
                </div>
                <ul class="sv-points">${s.heroPoints.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
            </div>
        </section>

        <section class="sv-section sv-section--alt">
            <div class="sv-wrap">
                <span class="sv-eyebrow">01 · El problema</span>
                <h2 class="sv-h2">${esc(s.problemTitle)}</h2>
                <div class="sv-cols">
                    ${tiles(s.problems, 'sv-tile--problem', CROSS)}
                </div>
            </div>
        </section>

        <section class="sv-section">
            <div class="sv-wrap">
                <span class="sv-eyebrow">02 · Lo que incluye</span>
                <h2 class="sv-h2">${esc(s.includedTitle)}</h2>
                <p class="sv-lead">${esc(s.includedLead)}</p>
                <div class="sv-cols">
                    ${tiles(s.included, '', CHECK)}
                </div>
            </div>
        </section>

        <section class="sv-section sv-section--alt">
            <div class="sv-wrap">
                <span class="sv-eyebrow">03 · Para quién</span>
                <h2 class="sv-h2">Para negocios como el tuyo.</h2>
                <div class="sv-cols">
                    ${s.forWhom.map((x) => `<div class="sv-tile sv-reveal"><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></div>`).join('\n                    ')}
                </div>
            </div>
        </section>
${s.showcase ? `
        <section class="sv-section">
            <div class="sv-wrap">
                <span class="sv-eyebrow">04 · Webs reales</span>
                <h2 class="sv-h2">Así se ven nuestros proyectos.</h2>
                <div class="sv-showcase">
                    ${SHOWCASE.map((x) => `<a class="sv-shot sv-reveal" href="/html/portfolio"><img src="${x.img}" alt="Web de ${esc(x.name)}" loading="lazy" decoding="async"><span>${esc(x.name)}</span><small>${esc(x.kind)}</small></a>`).join('\n                    ')}
                </div>
                <div class="sv-more"><a href="/html/portfolio">Ver todo el portfolio ${ARROW.replace('<svg', '<svg width="16" height="16"')}</a></div>
            </div>
        </section>
` : ''}
        <section class="sv-section${s.showcase ? ' sv-section--alt' : ''}">
            <div class="sv-wrap">
                <span class="sv-eyebrow">${s.showcase ? '05' : '04'} · Cómo avanzamos</span>
                <h2 class="sv-h2">Así trabajamos.</h2>
                <p class="sv-lead">Compartimos referencias, alcance y prioridades antes de producir. Sin sorpresas a mitad de camino.</p>
                <ol class="sv-steps">
                    ${s.steps.map((x) => `<li class="sv-reveal"><h3>${esc(x.t)}</h3><p>${esc(x.d)}</p></li>`).join('\n                    ')}
                </ol>
            </div>
        </section>

        <section class="sv-section${s.showcase ? '' : ' sv-section--alt'}">
            <div class="sv-wrap">
                <span class="sv-eyebrow">Preguntas frecuentes</span>
                <h2 class="sv-h2">Antes de empezar.</h2>
                <div class="sv-faq">
                    ${s.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n                    ')}
                </div>
            </div>
        </section>

        <section class="sv-section">
            <div class="sv-wrap">
                <div class="sv-cta">
                    <span class="sv-eyebrow">Hablemos</span>
                    <h2 class="sv-h2">¿Te cuento cómo lo haríamos en tu caso?</h2>
                    <p class="sv-lead">Cuéntanos qué necesitas. Te respondemos con una propuesta clara y sin compromiso.</p>
                    <div class="sv-hero__cta">
                        <a class="sv-btn sv-btn--primary" href="${ctaHref}">Pedir presupuesto</a>
                        <a class="sv-btn sv-btn--ghost" href="${wa}" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
                    </div>
                </div>

                <div style="margin-top:4rem">
                    <span class="sv-eyebrow">Te puede interesar</span>
                    <div class="sv-related">
                        ${rel.map((r) => `<a class="sv-rel" href="/servicios/${r.slug}" data-svc="${esc(r.name)}"><b>${esc(r.name)}</b><span>${esc(r.short)}</span><em>Ver servicio →</em></a>`).join('\n                        ')}
                    </div>
                    <div class="sv-more"><a href="/servicios">Ver todos los servicios ${ARROW.replace('<svg', '<svg width="16" height="16"')}</a></div>
                </div>
            </div>
        </section>
    </main>

    ${footerHtml()}

${scripts}
</body>
</html>
`;
};

// ---------- Página índice / buscador ----------
const hubPage = () => {
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Servicios de Dazenty',
      url: `${SITE}/servicios`,
      hasPart: SERVICES.map((s) => ({ '@type': 'Service', name: s.name, url: `${SITE}/servicios/${s.slug}` })),
    },
  ];
  return `${head({
    title: 'Servicios | Diseño web, software, IA y automatización | Dazenty',
    desc: 'Todos los servicios de Dazenty: diseño web, software a medida, agentes de IA, automatizaciones, branding, redes sociales, SEO local y mantenimiento.',
    path: '/servicios',
    ld,
  })}

<body class="bg-brand-dark text-white overflow-x-hidden antialiased selection:bg-brand-blue selection:text-black sv-page">

    ${headerHtml()}

    <main>
        <section class="sv-hero" style="padding-bottom:2rem">
            <div class="sv-hero__orb" aria-hidden="true"></div>
            <div class="sv-wrap" style="position:relative">
                <nav class="sv-crumbs" aria-label="Ruta"><a href="/">Inicio</a><span aria-hidden="true">/</span><span aria-current="page">Servicios</span></nav>
                <span class="sv-eyebrow">Servicios</span>
                <h1>Las piezas que hacen crecer tu negocio.</h1>
                <p class="sv-hero__lead">Cada servicio funciona por sí solo. Combinados, forman un sistema que capta, atiende y crece contigo. Dinos qué quieres conseguir y te enseñamos por dónde empezar.</p>
            </div>
        </section>

        <section class="sv-section" style="padding-top:2rem">
            <div class="sv-wrap">
                <div class="sv-finder" data-sv-finder>
                    <div class="sv-finder__row">
                        <div class="sv-search" role="search">
                            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <label for="sv-q" class="sr-only">Buscar un servicio</label>
                            <input id="sv-q" type="search" placeholder="Busca: web, chatbot, logo, Google…" autocomplete="off">
                        </div>
                        <div class="sv-view" role="group" aria-label="Forma de ver los servicios">
                            <button type="button" data-view="cards" aria-pressed="true">Tarjetas</button>
                            <button type="button" data-view="list" aria-pressed="false">Lista</button>
                        </div>
                    </div>
                    <div class="sv-chips" role="group" aria-label="Filtrar por objetivo">
                        <button type="button" class="sv-chip" data-goal="todos" aria-pressed="true">Todos</button>
                        ${GOALS.map((g) => `<button type="button" class="sv-chip" data-goal="${g.id}" aria-pressed="false">${esc(g.label)}</button>`).join('\n                        ')}
                    </div>
                    <p class="sv-count" aria-live="polite"></p>
                </div>

                ${gridHtml()}

                <div class="sv-empty" role="status">
                    <p>No encontramos nada con esa búsqueda. <a href="${waLink('Hola, no sé qué servicio necesito. ¿Me orientáis?')}" target="_blank" rel="noopener noreferrer">Cuéntanos qué necesitas por WhatsApp</a> y te orientamos.</p>
                </div>
            </div>
        </section>

        <section class="sv-section sv-section--alt">
            <div class="sv-wrap">
                <div class="sv-cta">
                    <span class="sv-eyebrow">¿No sabes por dónde empezar?</span>
                    <h2 class="sv-h2">Cuéntanos tu caso y te recomendamos.</h2>
                    <p class="sv-lead">En una conversación breve vemos qué necesitas ahora y qué puede esperar.</p>
                    <div class="sv-hero__cta">
                        <a class="sv-btn sv-btn--primary" href="/#contacto">Hablemos</a>
                        <a class="sv-btn sv-btn--ghost" href="${waLink('Hola, no sé qué servicio necesito. ¿Me orientáis?')}" target="_blank" rel="noopener noreferrer">Escribir por WhatsApp</a>
                    </div>
                </div>
            </div>
        </section>
    </main>

    ${footerHtml()}

${scripts}
</body>
</html>
`;
};

// ---------- Escritura ----------
mkdirSync(join(ROOT, 'servicios'), { recursive: true });
writeFileSync(join(ROOT, 'servicios', 'index.html'), hubPage());
SERVICES.forEach((s) => writeFileSync(join(ROOT, 'servicios', `${s.slug}.html`), servicePage(s)));

// ---------- index.html: bloques marcados ----------
const replaceBlock = (html, name, content) => {
  const re = new RegExp(`(<!--SVC:${name}-->)[\\s\\S]*?(<!--/SVC:${name}-->)`);
  if (!re.test(html)) throw new Error(`Falta el marcador SVC:${name} en index.html`);
  return html.replace(re, `$1\n${content}\n                    $2`);
};
let index = readFileSync(join(ROOT, 'index.html'), 'utf8');
index = replaceBlock(index, 'GRID', `                    ${gridHtml()}`);
index = replaceBlock(index, 'OPTIONS', SERVICES.map((s) => `                                    <option value="${esc(s.name)}">${esc(s.name)}</option>`).join('\n') + '\n                                    <option value="Otro / No lo tengo claro">Otro / No lo tengo claro</option>');
index = replaceBlock(index, 'FOOTER', SERVICES.map((s) => `                        <li><a href="/servicios/${s.slug}" class="hover:text-brand-blue transition-colors">${esc(s.name)}</a></li>`).join('\n'));
index = replaceBlock(index, 'HEADER', `    ${headerHtml()}`);
writeFileSync(join(ROOT, 'index.html'), index);

// ---------- sitemap ----------
let sm = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
sm = sm.replace(/\s*<!-- Servicios -->[\s\S]*?<!-- \/Servicios -->/, '');
const today = new Date().toISOString().slice(0, 10);
const urls = [{ p: '/servicios', pr: '0.9' }, ...SERVICES.map((s) => ({ p: `/servicios/${s.slug}`, pr: '0.8' }))]
  .map((u) => `  <url>\n    <loc>${SITE}${u.p}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${u.pr}</priority>\n  </url>`)
  .join('\n\n');
sm = sm.replace('</urlset>', `\n  <!-- Servicios -->\n${urls}\n  <!-- /Servicios -->\n</urlset>`);
writeFileSync(join(ROOT, 'sitemap.xml'), sm);

console.log(`OK: ${SERVICES.length} servicios + índice generados.`);
