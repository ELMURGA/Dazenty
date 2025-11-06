// ===== LOADER DE PÁGINA =====
window.addEventListener('load', () => {
    const loader = document.querySelector('.page-loader');
    if (loader) {
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 500);
    }
});

// ===== EFECTO HACKER EN TÍTULO =====
document.addEventListener('DOMContentLoaded', () => {
    const target = document.getElementById('hacker-title');
    if (!target) return;

    const originalText = target.dataset.text; // "DAZENTY"
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ*&%$#@![]{}|";
    let interval = null;
    let iteration = 0;

    // Esperamos un instante para que el efecto se sienta intencionado
    setTimeout(() => {
        interval = setInterval(() => {
            target.innerText = originalText.split("")
                .map((letter, index) => {
                    // Si ya hemos "revelado" esta letra, mostrar la original
                    if(index < iteration) {
                        return originalText[index];
                    }
                    
                    // Si no, mostrar un carácter aleatorio
                    return letters[Math.floor(Math.random() * letters.length)];
                })
                .join("");

            // Condición de parada: cuando todas las letras están reveladas
            if(iteration >= originalText.length){
                clearInterval(interval);
            }
            
            // Incrementamos la iteración
            iteration += 1 / 3;
        }, 60);
    }, 100);
});

// ===== MENÚ MÓVIL =====
const menuToggle = document.getElementById('menu-toggle');
const mobileMenu = document.getElementById('mobile-menu');
const header = document.getElementById('header');
const menuLinks = document.querySelectorAll('.menu-link');

// Toggle menú móvil
if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('hidden');
        mobileMenu.classList.toggle('flex');
        // Bloquear scroll del body cuando el menú está abierto
        document.body.classList.toggle('overflow-hidden');
    });

    // Cerrar menú al hacer clic en un enlace
    menuLinks.forEach(link => {
        link.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            mobileMenu.classList.remove('flex');
            document.body.classList.remove('overflow-hidden');
        });
    });
}

// ===== HEADER CON EFECTO DE SCROLL =====
window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        header.classList.add('bg-brand-dark/90', 'backdrop-blur-lg', 'shadow-lg');
    } else {
        header.classList.remove('bg-brand-dark/90', 'backdrop-blur-lg', 'shadow-lg');
    }
});

// ===== ANIMACIONES AL HACER SCROLL =====
const revealElements = () => {
    const reveals = document.querySelectorAll('.reveal');
    
    reveals.forEach(element => {
        const windowHeight = window.innerHeight;
        const elementTop = element.getBoundingClientRect().top;
        const elementVisible = 150;
        
        if (elementTop < windowHeight - elementVisible) {
            element.classList.add('active');
        }
    });
};

window.addEventListener('scroll', revealElements);
revealElements(); // Ejecutar al cargar la página

// ===== INICIALIZAR AOS (Animate On Scroll) =====
if (typeof AOS !== 'undefined') {
    AOS.init({
        duration: 1000,
        once: true,
        offset: 100,
        easing: 'ease-in-out'
    });
}

// ===== PARTÍCULAS DE FONDO (si particles.js está disponible) =====
if (typeof particlesJS !== 'undefined') {
    particlesJS('particles-js', {
        particles: {
            number: {
                value: 80,
                density: {
                    enable: true,
                    value_area: 800
                }
            },
            color: {
                value: '#00BFFF'
            },
            shape: {
                type: 'circle'
            },
            opacity: {
                value: 0.3,
                random: false
            },
            size: {
                value: 3,
                random: true
            },
            line_linked: {
                enable: true,
                distance: 150,
                color: '#00BFFF',
                opacity: 0.2,
                width: 1
            },
            move: {
                enable: true,
                speed: 2,
                direction: 'none',
                random: false,
                straight: false,
                out_mode: 'out',
                bounce: false
            }
        },
        interactivity: {
            detect_on: 'canvas',
            events: {
                onhover: {
                    enable: true,
                    mode: 'repulse'
                },
                onclick: {
                    enable: true,
                    mode: 'push'
                },
                resize: true
            },
            modes: {
                repulse: {
                    distance: 100,
                    duration: 0.4
                },
                push: {
                    particles_nb: 4
                }
            }
        },
        retina_detect: true
    });
}

// ===== CONTADOR ANIMADO PARA ESTADÍSTICAS =====
const animateCounters = () => {
    const counters = document.querySelectorAll('.counter');
    
    counters.forEach(counter => {
        const target = parseInt(counter.getAttribute('data-target'));
        const duration = 2000; // 2 segundos
        const increment = target / (duration / 16); // 60 FPS
        let current = 0;
        
        const updateCounter = () => {
            current += increment;
            if (current < target) {
                counter.textContent = Math.ceil(current);
                requestAnimationFrame(updateCounter);
            } else {
                counter.textContent = target;
            }
        };
        
        // Observador para iniciar el contador cuando sea visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    updateCounter();
                    observer.unobserve(entry.target);
                }
            });
        });
        
        observer.observe(counter);
    });
};

// Ejecutar animación de contadores al cargar
document.addEventListener('DOMContentLoaded', animateCounters);

// ===== SMOOTH SCROLL PARA NAVEGACIÓN =====
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
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

// ===== VALIDACIÓN DE FORMULARIO CON ANIMACIONES =====
const contactForm = document.querySelector('#contacto form');
if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Aquí puedes agregar tu lógica de envío de formulario
        const formData = new FormData(contactForm);
        
        // Mostrar mensaje de éxito con animación
        const successMessage = document.createElement('div');
        successMessage.className = 'fixed top-20 right-4 bg-brand-blue-500 text-brand-dark px-6 py-4 rounded-lg shadow-lg transform translate-x-full transition-transform duration-500 z-50';
        successMessage.innerHTML = `
            <div class="flex items-center gap-3">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span class="font-bold">¡Mensaje enviado con éxito!</span>
            </div>
        `;
        document.body.appendChild(successMessage);
        
        setTimeout(() => {
            successMessage.style.transform = 'translateX(0)';
        }, 100);
        
        setTimeout(() => {
            successMessage.style.transform = 'translateX(150%)';
            setTimeout(() => {
                successMessage.remove();
            }, 500);
        }, 3000);
        
        // Resetear formulario
        contactForm.reset();
    });
}

// ===== EFECTO PARALLAX EN EL HERO =====
window.addEventListener('scroll', () => {
    const heroSection = document.getElementById('inicio');
    if (heroSection) {
        const scrolled = window.pageYOffset;
        const parallaxElements = heroSection.querySelectorAll('.parallax');
        parallaxElements.forEach(element => {
            const speed = element.dataset.speed || 0.5;
            element.style.transform = `translateY(${scrolled * speed}px)`;
        });
    }
});
