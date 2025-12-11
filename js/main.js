// ===== MAIN.JS OPTIMIZADO PARA RENDIMIENTO =====
// Dazenty - Web Performance Optimized

// ===== UTILIDADES DE RENDIMIENTO =====
// Throttle function para limitar llamadas
const throttle = (func, limit) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

// ===== LOADER DE PÁGINA =====
window.addEventListener('load', () => {
    const loader = document.querySelector('.page-loader');
    if (loader) {
        // Usar requestAnimationFrame para animación suave
        requestAnimationFrame(() => {
            loader.classList.add('hidden');
        });
    }
});

// ===== EFECTO HACKER EN TÍTULO (OPTIMIZADO - DIFERIDO) =====
document.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('hacker-title');
    if (!target) return;

    // Solo ejecutar en desktop para no afectar móvil
    if (window.innerWidth < 768) {
        target.textContent = target.dataset.text;
        return;
    }

    const originalText = target.dataset.text;
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let iteration = 0;

    // Diferir el efecto 1.5s para no bloquear renderizado inicial
    setTimeout(() => {
        const animate = () => {
            requestAnimationFrame(() => {
                target.textContent = originalText.split("")
                    .map((letter, index) => {
                        if (index < iteration) return originalText[index];
                        return letters[Math.floor(Math.random() * letters.length)];
                    })
                    .join("");

                if (iteration < originalText.length) {
                    iteration += 1 / 3;
                    setTimeout(animate, 60);
                }
            });
        };
        animate();
    }, 1500);
});

// ===== MENÚ MÓVIL =====
const menuToggle = document.getElementById('menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');
const header = document.getElementById('header');
const menuLinks = document.querySelectorAll('.menu-link');

if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
        const isExpanded = menuToggle.getAttribute('aria-expanded') === 'true';
        
        mobileMenu.classList.toggle('hidden');
        mobileMenu.classList.toggle('flex');
        document.body.classList.toggle('overflow-hidden');
        
        // Actualizar aria-expanded para accesibilidad
        menuToggle.setAttribute('aria-expanded', !isExpanded);
    });

    // Cerrar menú al hacer clic en un enlace
    menuLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            mobileMenu.classList.remove('flex');
            document.body.classList.remove('overflow-hidden');
            menuToggle.setAttribute('aria-expanded', 'false');
        });
    });
}

// ===== HEADER CON EFECTO DE SCROLL (OPTIMIZADO) =====
const handleScroll = throttle(() => {
    if (window.scrollY > 50) {
        header.classList.add('bg-brand-dark/90', 'backdrop-blur-lg', 'shadow-lg');
    } else {
        header.classList.remove('bg-brand-dark/90', 'backdrop-blur-lg', 'shadow-lg');
    }
}, 100);

window.addEventListener('scroll', handleScroll, { passive: true });

// ===== ANIMACIONES AL HACER SCROLL (USANDO INTERSECTION OBSERVER) =====
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            revealObserver.unobserve(entry.target);
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

document.querySelectorAll('.reveal').forEach(element => {
    revealObserver.observe(element);
});

// ===== INICIALIZAR AOS (SI ESTÁ CARGADO) =====
// AOS se carga de forma diferida, verificamos si existe
if (typeof AOS !== 'undefined') {
    AOS.init({
        duration: 600,
        once: true,
        offset: 50,
        easing: 'ease-out'
    });
}

// ===== CONTADOR ANIMADO PARA ESTADÍSTICAS (OPTIMIZADO) =====
const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const counter = entry.target;
            const target = parseInt(counter.getAttribute('data-target'));
            const duration = 1500;
            const startTime = performance.now();
            
            const updateCounter = (currentTime) => {
                const elapsed = currentTime - startTime;
                const progress = Math.min(elapsed / duration, 1);
                
                // Easing function para animación suave
                const easeOutQuart = 1 - Math.pow(1 - progress, 4);
                const current = Math.ceil(target * easeOutQuart);
                
                counter.textContent = current;
                
                if (progress < 1) {
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.textContent = target;
                }
            };
            
            requestAnimationFrame(updateCounter);
            counterObserver.unobserve(counter);
        }
    });
}, {
    threshold: 0.5
});

document.querySelectorAll('.counter').forEach(counter => {
    counterObserver.observe(counter);
});

// ===== SMOOTH SCROLL PARA NAVEGACIÓN =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href !== '#' && href !== '#!') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        }
    });
});

// ===== VALIDACIÓN DE FORMULARIO =====
const contactForm = document.querySelector('#contacto form');
if (contactForm) {
    // El formulario usa FormSubmit, no necesitamos interceptarlo
    // Solo añadimos feedback visual al enviar
    contactForm.addEventListener('submit', function() {
        const button = this.querySelector('button[type="submit"]');
        if (button) {
            button.textContent = 'Enviando...';
            button.disabled = true;
        }
    });
}

// ===== EFECTO PARALLAX EN EL HERO (OPTIMIZADO - SOLO DESKTOP) =====
if (window.innerWidth >= 768) {
    const heroSection = document.getElementById('inicio');
    const parallaxElements = heroSection?.querySelectorAll('.parallax');
    
    if (parallaxElements && parallaxElements.length > 0) {
        const handleParallax = throttle(() => {
            const scrolled = window.pageYOffset;
            
            requestAnimationFrame(() => {
                parallaxElements.forEach(element => {
                    const speed = parseFloat(element.dataset.speed) || 0.5;
                    element.style.transform = `translate3d(0, ${scrolled * speed}px, 0)`;
                });
            });
        }, 16); // ~60fps
        
        window.addEventListener('scroll', handleParallax, { passive: true });
    }
}

// ===== PRECARGA DE PÁGINAS EN HOVER (MEJORA NAVEGACIÓN) =====
document.querySelectorAll('a[href^="html/"]').forEach(link => {
    link.addEventListener('mouseenter', function() {
        const href = this.getAttribute('href');
        if (href && !document.querySelector(`link[rel="prefetch"][href="${href}"]`)) {
            const prefetch = document.createElement('link');
            prefetch.rel = 'prefetch';
            prefetch.href = href;
            document.head.appendChild(prefetch);
        }
    }, { once: true });
});
