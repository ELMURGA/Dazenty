// Page Loader Animation
const dismissLoader = () => {
    const loader = document.querySelector('.page-loader');
    if (loader && !loader.classList.contains('hidden')) {
        // Brief loader — keep it fast for LCP
        setTimeout(() => {
            loader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                loader.style.display = 'none';
            }, 300);
        }, 200);
    }
};

// Dismiss loader as soon as DOM is ready (main.js runs deferred)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', dismissLoader);
} else {
    dismissLoader();
}

// Safety fallback: force hide loader after 1 second max
setTimeout(dismissLoader, 1000);

// Also bind to window load as a fallback
window.addEventListener('load', dismissLoader);

// Detectar iOS — Lenis causa problemas graves en iOS Safari
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// Detectar cualquier dispositivo táctil — Lenis (scroll virtualizado) también
// puede "trabar"/ralentizar el scroll con el dedo en Android/Chrome móvil,
// no solo en iOS. En táctil dejamos el scroll nativo (ya es fluido de por sí).
const isTouchDevice = isIOS
    || ('ontouchstart' in window)
    || navigator.maxTouchPoints > 0
    || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

let lenis = null;

function initLenis() {
    // Detectar Chrome/Chromium para ajustar duración
    const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg|OPR/.test(navigator.userAgent);
    lenis = new Lenis({
        duration: isChrome ? 0.85 : 1.0,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smooth: true,
        smoothTouch: false,
    });
    window.lenis = lenis; // Export global for other scripts (like portfolio.html drawer)

    function raf(time) {
        if (lenis) lenis.raf(time);
        requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
}

// Cargar Lenis solo en desktop/no-táctil (ahorra una petición CDN en móvil
// y evita el scroll trabado que provoca en dispositivos táctiles)
if (!isTouchDevice) {
    const lenisScript = document.createElement('script');
    lenisScript.src = 'https://cdn.jsdelivr.net/gh/studio-freight/lenis@1.0.29/bundled/lenis.min.js';
    lenisScript.onload = initLenis;
    document.head.appendChild(lenisScript);
}

// Logo → scroll suave al top (solo en la home; en el resto navega a "/")
const logoLink = document.querySelector('.site-header__logo');
const isHomePage = window.location.pathname === '/' || /\/index\.html$/.test(window.location.pathname);
if (logoLink && isHomePage) {
    logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (lenis) {
            lenis.scrollTo(0);
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

// Header — menú móvil (panel a pantalla completa, sin overflow posible)
const navToggle = document.getElementById('nav-toggle');
const mobileNav  = document.getElementById('mobile-nav');
if (navToggle && mobileNav) {

    function closeMobileNav() {
        navToggle.classList.remove('is-active');
        navToggle.setAttribute('aria-expanded', 'false');
        mobileNav.classList.remove('is-open');
        document.body.classList.remove('nav-open');
    }
    function openMobileNav() {
        navToggle.classList.add('is-active');
        navToggle.setAttribute('aria-expanded', 'true');
        mobileNav.classList.add('is-open');
        document.body.classList.add('nav-open');
    }

    navToggle.addEventListener('click', () => {
        if (mobileNav.classList.contains('is-open')) {
            closeMobileNav();
        } else {
            openMobileNav();
        }
    });

    // Cerrar al pulsar un enlace del menú
    mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobileNav));

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMobileNav();
    });

    // Si se pasa a escritorio con el menú abierto, cerrarlo
    window.addEventListener('resize', () => {
        if (window.innerWidth >= 768) closeMobileNav();
    });
}

// GSAP Animations (solo en páginas que lo cargan)
if (typeof gsap !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    // Hero Text Reveal
    gsap.from('.hero-text-reveal', {
        y: 100,
        opacity: 0,
        duration: 1,
        stagger: 0.2,
        ease: 'power4.out',
        delay: 0.5
    });

    // Service Cards Stagger (solo fade, sin desplazamiento vertical
    // para que los iconos de cada servicio queden siempre a la misma altura)
    gsap.utils.toArray('.service-card').forEach((card, i) => {
        gsap.from(card, {
            scrollTrigger: { trigger: card, start: 'top 85%' },
            opacity: 0,
            duration: 0.8,
            delay: i * 0.1,
            ease: 'power3.out'
        });
    });

    // Project Items Reveal
    gsap.utils.toArray('.project-item').forEach((item) => {
        gsap.from(item, {
            scrollTrigger: { trigger: item, start: 'top 80%' },
            y: 60,
            opacity: 0,
            duration: 1,
            ease: 'power3.out'
        });
    });

    // Scroll Reveal General
    gsap.utils.toArray('.scrol-reveal').forEach((item, i) => {
        gsap.from(item, {
            scrollTrigger: { trigger: item, start: 'top 90%' },
            y: 30,
            opacity: 0,
            duration: 0.8,
            delay: i * 0.1,
            ease: 'power2.out'
        });
    });

    // Stats Counter
    document.querySelectorAll('.counter').forEach(counter => {
        const target = +counter.getAttribute('data-target');
        ScrollTrigger.create({
            trigger: counter,
            start: 'top 85%',
            onEnter: () => {
                gsap.to(counter, {
                    innerHTML: target,
                    duration: 2,
                    snap: { innerHTML: 1 },
                    ease: 'power1.inOut'
                });
            }
        });
    });
}

// Contact Form — AJAX para evitar que la página navegue/suba al enviar
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    // Anti-bot: marca timestamp de carga; el servidor rechaza envíos demasiado rápidos
    const tsField = contactForm.querySelector('[name="ts"]');
    if (tsField) tsField.value = Date.now();

    // iOS FIX: el teclado virtual hace que Safari salte al top cuando el body
    // tiene overflow:hidden (que Lenis aplica). Solución: guardar la posición
    // en touchstart (antes de que el teclado abra), parar Lenis, y restaurar
    // la posición inmediatamente con requestAnimationFrame + visualViewport.

    let _savedScrollY = 0;

    // touchstart se dispara ANTES de focusin → capturamos posición a tiempo
    contactForm.addEventListener('touchstart', () => {
        _savedScrollY = window.scrollY;
    }, { passive: true });

    contactForm.addEventListener('focusin', () => {
        if (lenis) lenis.stop();
        // Solo restaurar posición en iOS (en desktop _savedScrollY sería 0 y saltaría al top)
        if (isIOS) {
            requestAnimationFrame(() => {
                window.scrollTo(0, _savedScrollY);
                requestAnimationFrame(() => {
                    window.scrollTo(0, _savedScrollY);
                });
            });
        }
    });

    // visualViewport: detecta cuando el teclado iOS abre/cierra para re-anclarse
    if (isIOS && 'visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            const active = document.activeElement;
            const isField = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
            if (isField) {
                window.scrollTo(0, _savedScrollY);
            }
        });
    }

    contactForm.addEventListener('focusout', () => {
        // Esperar a que el teclado iOS cierre completamente (~400ms)
        setTimeout(() => {
            if (lenis) {
                lenis.scrollTo(window.scrollY, { immediate: true });
                lenis.start();
            }
        }, 450);
    });

    contactForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        e.stopPropagation();

        const submitBtn  = contactForm.querySelector('button[type="submit"]');
        const origText   = submitBtn.textContent;
        submitBtn.disabled    = true;
        submitBtn.textContent = 'Enviando...';

        const payload = {
            name:    contactForm.querySelector('[name="name"]').value.trim(),
            email:   contactForm.querySelector('[name="email"]').value.trim(),
            service: contactForm.querySelector('[name="service"]').value,
            message: contactForm.querySelector('[name="message"]').value.trim(),
            website: contactForm.querySelector('[name="website"]').value,
            ts:      contactForm.querySelector('[name="ts"]').value,
        };

        try {
            const res = await fetch('/api/contact', {
                method:  'POST',
                body:    JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                window.va && window.va('event', { name: 'Contact Form Submitted', data: { service: payload.service } });
                contactForm.reset();
                submitBtn.textContent = '✓ Mensaje enviado. ¡Gracias!';
                submitBtn.style.background = '#22c55e';
                setTimeout(() => {
                    submitBtn.textContent  = origText;
                    submitBtn.style.background = '';
                    submitBtn.disabled     = false;
                }, 5000);
            } else {
                throw new Error('server_error');
            }
        } catch {
            submitBtn.textContent = 'Hubo un error. Inténtalo de nuevo';
            submitBtn.disabled    = false;
            setTimeout(() => { submitBtn.textContent = origText; }, 4000);
        }
    });
}

// Service Modals — scroll solo en el modal, body bloqueado (iOS-safe)
let _svcScrollY = 0;

function openServiceModal(id) {
    const modal = document.getElementById('modal-' + id);
    if (!modal) return;
    _svcScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + _svcScrollY + 'px';
    document.body.style.width = '100%';
    modal.classList.remove('hidden');
    if (lenis) lenis.stop();
}

function closeServiceModal(id) {
    const modal = document.getElementById('modal-' + id);
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, _svcScrollY);
    if (lenis) lenis.start();
}

// Cerrar modal con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        ['web', 'grafico', 'marketing', 'n8n'].forEach(id => {
            const m = document.getElementById('modal-' + id);
            if (m && !m.classList.contains('hidden')) closeServiceModal(id);
        });
    }
});

// Vercel Analytics — Custom Events
function _va(name, data) {
    if (typeof window.va === 'function') window.va('event', Object.assign({ name }, data || {}));
}

// WhatsApp clicks
document.querySelectorAll('a[href*="wa.me"]').forEach(el => {
    el.addEventListener('click', () => _va('WhatsApp Click'));
});

// Phone clicks
document.querySelectorAll('a[href^="tel:"]').forEach(el => {
    el.addEventListener('click', () => _va('Phone Click'));
});

// "Solicitar presupuesto" desde modales de servicio
const serviceLabels = { web: 'Diseño Web', grafico: 'Diseño Gráfico', marketing: 'Marketing Digital', n8n: 'Automatización n8n' };
['web', 'grafico', 'marketing', 'n8n'].forEach(id => {
    const modal = document.getElementById('modal-' + id);
    if (!modal) return;
    modal.querySelector('a[href="#contacto"]')?.addEventListener('click', () => {
        _va('Request Budget', { service: serviceLabels[id] });
    });
});
