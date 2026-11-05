// Servicios: tarjetas giratorias, buscador con filtros y aparición progresiva.
(function () {
    'use strict';

    var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    // ---------- Tarjetas giratorias ----------
    var cards = Array.prototype.slice.call(document.querySelectorAll('.sv-card'));

    function setFlip(card, on) {
        card.classList.toggle('is-flipped', on);
        var front = card.querySelector('.sv-front');
        if (front) front.setAttribute('aria-expanded', on ? 'true' : 'false');
    }

    cards.forEach(function (card) {
        var front = card.querySelector('.sv-front');
        if (!front) return;

        if (canHover) {
            card.addEventListener('mouseenter', function () { setFlip(card, true); });
            card.addEventListener('mouseleave', function () {
                if (!card.contains(document.activeElement)) setFlip(card, false);
            });
        } else {
            front.addEventListener('click', function () { setFlip(card, true); });
            // Volver a la cara frontal pulsando en la parte trasera (fuera del enlace)
            card.querySelector('.sv-back').addEventListener('click', function (e) {
                if (!e.target.closest('a')) setFlip(card, false);
            });
        }

        // Teclado: al enfocar la tarjeta se muestra la parte trasera con su enlace
        card.addEventListener('focusin', function () { setFlip(card, true); });
        card.addEventListener('focusout', function (e) {
            if (!card.contains(e.relatedTarget)) setFlip(card, false);
        });

        // Foco de luz que sigue al cursor
        card.addEventListener('pointermove', function (e) {
            var r = card.getBoundingClientRect();
            card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            card.style.setProperty('--my', (e.clientY - r.top) + 'px');
        });
    });

    // En táctil, tocar fuera cierra las tarjetas abiertas
    if (!canHover) {
        document.addEventListener('click', function (e) {
            cards.forEach(function (card) {
                if (!card.contains(e.target)) setFlip(card, false);
            });
        });
    }

    // ---------- Buscador / filtros ----------
    var finder = document.querySelector('[data-sv-finder]');
    if (finder) {
        var grid = document.querySelector('.sv-grid');
        var items = Array.prototype.slice.call(grid.querySelectorAll('.sv-item'));
        var input = finder.querySelector('#sv-q');
        var chips = Array.prototype.slice.call(finder.querySelectorAll('.sv-chip'));
        var count = finder.querySelector('.sv-count');
        var empty = document.querySelector('.sv-empty');
        var viewBtns = Array.prototype.slice.call(finder.querySelectorAll('.sv-view button'));
        var goal = 'todos';

        var norm = function (s) {
            return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
        };

        var apply = function () {
            var q = norm(input.value).trim();
            var shown = 0;
            items.forEach(function (it) {
                var goals = (it.getAttribute('data-goals') || '').split(' ');
                var okGoal = goal === 'todos' || goals.indexOf(goal) !== -1;
                var okText = !q || norm(it.getAttribute('data-search')).indexOf(q) !== -1;
                var ok = okGoal && okText;
                it.hidden = !ok;
                if (ok) shown++;
            });
            count.textContent = shown === items.length
                ? 'Mostrando los ' + shown + ' servicios'
                : (shown === 1 ? '1 servicio encaja' : shown + ' servicios encajan');
            if (empty) empty.classList.toggle('is-visible', shown === 0);
        };

        chips.forEach(function (chip) {
            chip.addEventListener('click', function () {
                goal = chip.getAttribute('data-goal');
                chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
                apply();
            });
        });
        input.addEventListener('input', apply);

        viewBtns.forEach(function (b) {
            b.addEventListener('click', function () {
                var list = b.getAttribute('data-view') === 'list';
                grid.classList.toggle('is-list', list);
                viewBtns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
                cards.forEach(function (c) { setFlip(c, false); });
            });
        });

        // Permite enlazar un objetivo: /servicios?objetivo=tiempo
        var pre = new URLSearchParams(window.location.search).get('objetivo');
        if (pre) {
            var target = chips.filter(function (c) { return c.getAttribute('data-goal') === pre; })[0];
            if (target) target.click();
        }
        apply();
    }

    // ---------- Aparición progresiva ----------
    var reveals = document.querySelectorAll('.sv-reveal');
    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
            });
        }, { threshold: 0.12 });
        reveals.forEach(function (el) { io.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add('is-in'); });
    }

    // ---------- Analítica ----------
    document.querySelectorAll('a[data-svc]').forEach(function (a) {
        a.addEventListener('click', function () {
            if (typeof window.va === 'function') {
                window.va('event', { name: 'Service Click', data: { service: a.getAttribute('data-svc') } });
            }
        });
    });
})();
