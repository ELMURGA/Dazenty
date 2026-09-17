/**
 * Cookie Consent Banner — RGPD compliant
 * ────────────────────────────────────────
 * Muestra un banner la primera vez que el usuario visita el sitio.
 * Si acepta → guarda consentimiento en localStorage y dispara
 *             el evento 'cookie-consent-granted' para que analytics.js
 *             cargue Google Analytics y Vercel Insights.
 * Si rechaza → guarda rechazo, no carga cookies analíticas.
 * La preferencia se recuerda durante 180 días (6 meses).
 */

(function () {
    'use strict';

    const CONSENT_KEY = 'dazenty_cookie_consent';
    const CONSENT_EXPIRY = 180; // días

    // ── Helpers ────────────────────────────────────────────────
    function getConsent() {
        try {
            const raw = localStorage.getItem(CONSENT_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            // Caduca tras CONSENT_EXPIRY días
            if (Date.now() - data.timestamp > CONSENT_EXPIRY * 24 * 60 * 60 * 1000) {
                localStorage.removeItem(CONSENT_KEY);
                return null;
            }
            return data.accepted;
        } catch {
            return null;
        }
    }

    function setConsent(accepted) {
        localStorage.setItem(CONSENT_KEY, JSON.stringify({
            accepted: accepted,
            timestamp: Date.now(),
        }));
    }

    // ── Dispatch custom event ──────────────────────────────────
    function notifyConsent(accepted) {
        window.dispatchEvent(new CustomEvent('cookie-consent', {
            detail: { accepted: accepted },
        }));
    }

    // ── Banner HTML ────────────────────────────────────────────
    function createBanner() {
        const banner = document.createElement('div');
        banner.id = 'cookie-banner';
        banner.className = 'cookie-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Aviso de cookies');
        banner.innerHTML = `
            <div class="cookie-banner__inner">
                <div class="cookie-banner__text">
                    <svg class="cookie-banner__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10c0-.34-.02-.67-.05-1a4.49 4.49 0 01-3.45-1.5A4.49 4.49 0 0115 8a4.49 4.49 0 01-1.5-3.45A9.93 9.93 0 0012 2z"/>
                        <circle cx="8" cy="14" r="1"/>
                        <circle cx="12" cy="11" r="1"/>
                        <circle cx="15" cy="16" r="1"/>
                        <circle cx="9" cy="9" r=".75"/>
                    </svg>
                    <p>
                        Usamos cookies para mejorar tu experiencia y analizar el tráfico.
                        <a href="/html/privacidad" class="cookie-banner__link">Más información</a>
                    </p>
                </div>
                <div class="cookie-banner__actions">
                    <button id="cookie-reject" class="cookie-banner__btn cookie-banner__btn--reject">
                        Rechazar
                    </button>
                    <button id="cookie-accept" class="cookie-banner__btn cookie-banner__btn--accept">
                        Aceptar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(banner);

        // Forzar reflow para que la animación CSS arranque
        banner.offsetHeight; // eslint-disable-line no-unused-expressions
        requestAnimationFrame(() => banner.classList.add('is-visible'));

        // Event listeners
        document.getElementById('cookie-accept').addEventListener('click', () => {
            setConsent(true);
            notifyConsent(true);
            hideBanner(banner);
        });

        document.getElementById('cookie-reject').addEventListener('click', () => {
            setConsent(false);
            notifyConsent(false);
            hideBanner(banner);
        });
    }

    function hideBanner(banner) {
        banner.classList.remove('is-visible');
        banner.classList.add('is-hiding');
        banner.addEventListener('transitionend', () => banner.remove(), { once: true });
        // Fallback por si transitionend no dispara
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 600);
    }

    // ── Init ───────────────────────────────────────────────────
    const consent = getConsent();

    if (consent === null) {
        // No hay decisión previa → mostrar banner
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', createBanner, { once: true });
        } else {
            createBanner();
        }
    } else {
        // Ya hay decisión → notificar directamente
        notifyConsent(consent);
    }
})();
