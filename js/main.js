// Page Loader Animation
window.addEventListener('load', () => {
    const loader = document.querySelector('.page-loader');
    if (loader) {
        // Wait for letter animations to complete
        setTimeout(() => {
            loader.classList.add('hidden');
            // Remove from DOM after transition
            setTimeout(() => {
                loader.style.display = 'none';
            }, 800);
        }, 2000); // 2 seconds for all letters to decompose
    }
});

// Initialize Lenis (Smooth Scroll)
const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smooth: true,
});

function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

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

// Navbar Scroll Effect
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

console.log('Dazenty App Loaded');
