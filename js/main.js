// Page Loader Animation
window.addEventListener('load', () => {
    const loader = document.querySelector('.page-loader');
    if (loader) {
        // Brief loader — keep it fast for LCP
        setTimeout(() => {
            loader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                loader.style.display = 'none';
            }, 300);
        }, 400);
    }
});

// Flag global: indica que un campo del formulario está activo (iOS keyboard)
let _formActive = false;

// Detectar iOS — Lenis causa problemas graves en iOS Safari
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

let lenis = null;

function initLenis() {
    lenis = new Lenis({
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smooth: true,
    });

    function raf(time) {
        if (lenis) lenis.raf(time);
        requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
}

// Cargar Lenis solo en no-iOS (ahorra una petición CDN en Safari móvil)
if (!isIOS) {
    const lenisScript = document.createElement('script');
    lenisScript.src = 'https://cdn.jsdelivr.net/gh/studio-freight/lenis@1.0.29/bundled/lenis.min.js';
    lenisScript.onload = initLenis;
    document.head.appendChild(lenisScript);
}

// Logo → scroll suave al top
const logoLink = document.querySelector('.dz-nav__logo');
if (logoLink) {
    logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        if (lenis) {
            lenis.scrollTo(0);
        } else {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
}

// Custom Cursor
const cursorDot = document.querySelector('.cursor-dot');
const cursorOutline = document.querySelector('.cursor-outline');

if (cursorDot && cursorOutline) {
    window.addEventListener('mousemove', (e) => {
        const posX = e.clientX;
        const posY = e.clientY;

        // Dot follows instantly
        cursorDot.style.left = `${posX}px`;
        cursorDot.style.top = `${posY}px`;

        // Outline follows with slight delay
        cursorOutline.animate({
            left: `${posX}px`,
            top: `${posY}px`
        }, { duration: 500, fill: 'forwards' });
    });

    // Cursor interactions
    const interactiveElements = document.querySelectorAll('a, button, input, select, textarea');
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursorOutline.style.width = '60px';
            cursorOutline.style.height = '60px';
            cursorOutline.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        });
        el.addEventListener('mouseleave', () => {
            cursorOutline.style.width = '40px';
            cursorOutline.style.height = '40px';
            cursorOutline.style.backgroundColor = 'transparent';
        });
    });
}

// Floating Nav — toggle + scroll collapse
const dzNav    = document.getElementById('dz-nav');
const dzToggle = document.getElementById('dz-toggle');
if (dzNav && dzToggle) {

    const SCROLL_THRESHOLD = 80;

    function navOpen() {
        dzNav.classList.add('is-open');
        dzToggle.setAttribute('aria-expanded', 'true');
    }
    function navClose() {
        dzNav.classList.remove('is-open');
        dzToggle.setAttribute('aria-expanded', 'false');
    }

    // Estado inicial: abierto en desktop, cerrado en móvil
    if (window.innerWidth >= 768) {
        navOpen();
    } else {
        navClose();
    }

    // Clic en la pill cuando está cerrada → abrir
    dzNav.addEventListener('click', function (e) {
        if (!dzNav.classList.contains('is-open')) {
            e.preventDefault();
            navOpen();
        }
    });

    // Botón X → cerrar
    dzToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        navClose();
    });

    // Cerrar al hacer clic fuera (solo cuando está abierto, ignorar interacciones con formularios)
    document.addEventListener('click', function (e) {
        if (!dzNav.classList.contains('is-open')) return;
        if (dzNav.contains(e.target)) return;
        // No cerrar si el clic es dentro de un formulario o en un campo
        if (e.target.closest('form, input, textarea, select, label')) return;
        navClose();
    });

    // Scroll: colapsar al bajar, expandir al volver arriba
    // Ignora el scroll causado por iOS al abrir/cerrar el teclado virtual
    window.addEventListener('scroll', function () {
        if (_formActive) return;
        const active = document.activeElement;
        const isKeyboardOpen = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
        if (isKeyboardOpen) return;
        const y = window.scrollY;
        if (y > SCROLL_THRESHOLD) {
            if (dzNav.classList.contains('is-open')) navClose();
        } else {
            if (!dzNav.classList.contains('is-open')) navOpen();
        }
    }, { passive: true });
}

// Navbar Scroll Effect (legacy — ya no se usa el #navbar de ancho completo)
const navbar = document.getElementById('navbar');
if (navbar) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('bg-brand-dark/95', 'backdrop-blur-xl', 'shadow-lg');
            navbar.querySelector('.absolute').classList.add('opacity-100');
        } else {
            navbar.classList.remove('bg-brand-dark/95', 'backdrop-blur-xl', 'shadow-lg');
            navbar.querySelector('.absolute').classList.remove('opacity-100');
        }
    });
}

// Mobile Menu
const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const closeMenuBtn = document.getElementById('close-menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const mobileLinks = document.querySelectorAll('.mobile-link');

function toggleMenu() {
    mobileMenu.classList.toggle('translate-x-full');
    document.body.classList.toggle('overflow-hidden');
}

if (mobileMenuBtn) {
    mobileMenuBtn.addEventListener('click', toggleMenu);
    closeMenuBtn.addEventListener('click', toggleMenu);
    
    mobileLinks.forEach(link => {
        link.addEventListener('click', toggleMenu);
    });
}

// GSAP Animations
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

// Service Cards Stagger
gsap.utils.toArray('.service-card').forEach((card, i) => {
    gsap.from(card, {
        scrollTrigger: {
            trigger: card,
            start: 'top 85%',
        },
        y: 50,
        opacity: 0,
        duration: 0.8,
        delay: i * 0.1,
        ease: 'power3.out'
    });
});

// Project Items Parallax/Reveal
gsap.utils.toArray('.project-item').forEach((item) => {
    gsap.from(item, {
        scrollTrigger: {
            trigger: item,
            start: 'top 80%',
        },
        y: 60,
        opacity: 0,
        duration: 1,
        ease: 'power3.out'
    });
});

// Scroll Reveal General
gsap.utils.toArray('.scrol-reveal').forEach((item, i) => {
    gsap.from(item, {
        scrollTrigger: {
            trigger: item,
            start: 'top 90%',
        },
        y: 30,
        opacity: 0,
        duration: 0.8,
        delay: i * 0.1,
        ease: 'power2.out'
    });
});


// Stats Counter
const counters = document.querySelectorAll('.counter');
counters.forEach(counter => {
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

// Magnetic Buttons
const btns = document.querySelectorAll('.btn-glow');
btns.forEach(btn => {
    btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        btn.style.setProperty('--x', `${x}px`);
        btn.style.setProperty('--y', `${y}px`);
    });
});

// Contact Form — AJAX para evitar que la página navegue/suba al enviar
const contactForm = document.getElementById('contactForm');
if (contactForm) {
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
        _formActive = true;
        if (lenis) lenis.stop();
        // Restaurar posición en el siguiente frame (tras el salto de iOS)
        requestAnimationFrame(() => {
            window.scrollTo(0, _savedScrollY);
            requestAnimationFrame(() => {
                window.scrollTo(0, _savedScrollY);
            });
        });
    });

    // visualViewport: detecta cuando el teclado abre/cierra para re-anclarse
    if ('visualViewport' in window) {
        window.visualViewport.addEventListener('resize', () => {
            const active = document.activeElement;
            const isField = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
            if (isField) {
                // Teclado acaba de abrirse → restaurar posición guardada
                window.scrollTo(0, _savedScrollY);
            }
        });
    }

    contactForm.addEventListener('focusout', () => {
        // Esperar a que el teclado iOS cierre completamente (~400ms)
        setTimeout(() => {
            _formActive = false;
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
        ['web', 'grafico', 'marketing'].forEach(id => {
            const m = document.getElementById('modal-' + id);
            if (m && !m.classList.contains('hidden')) closeServiceModal(id);
        });
    }
});

console.log('Dazenty App Loaded');
