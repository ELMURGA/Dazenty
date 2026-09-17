/**
 * Analytics — solo se carga si el usuario acepta las cookies.
 * El script cookies.js dispara el evento 'cookie-consent' con
 * detail.accepted = true/false.
 */

window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };

function loadAnalytics() {
    for (const src of [
        'https://www.googletagmanager.com/gtag/js?id=G-QKRJPJPMF7',
        '/_vercel/insights/script.js'
    ]) {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onerror = () => console.warn('No se pudo cargar la analitica:', src);
        document.head.appendChild(script);
    }
    window.gtag('js', new Date());
    window.gtag('config', 'G-QKRJPJPMF7');
}

// Keep analytics and queued events, without competing with the initial render.
function scheduleAnalytics() {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadAnalytics, { timeout: 2000 });
    } else {
        setTimeout(loadAnalytics, 0);
    }
}

// Escuchar el evento de consentimiento de cookies
window.addEventListener('cookie-consent', function (e) {
    if (e.detail && e.detail.accepted) {
        if (document.readyState === 'complete') {
            scheduleAnalytics();
        } else {
            window.addEventListener('load', scheduleAnalytics, { once: true });
        }
    }
}, { once: true });
