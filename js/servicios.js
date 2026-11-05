// Servicios: la imagen de la derecha sigue a la fila señalada, filtro por objetivo y aparición progresiva.
(function () {
    'use strict';

    var index = document.querySelector('[data-sv-index]');
    if (index) {
        var rows = Array.prototype.slice.call(index.querySelectorAll('.sv-list li'));
        var figs = Array.prototype.slice.call(index.querySelectorAll('.sv-stage figure'));

        var show = function (slug) {
            figs.forEach(function (f) { f.classList.toggle('is-active', f.getAttribute('data-slug') === slug); });
        };
        rows.forEach(function (li) {
            var slug = li.getAttribute('data-slug');
            var a = li.querySelector('a');
            a.addEventListener('mouseenter', function () { show(slug); });
            a.addEventListener('focus', function () { show(slug); });
        });

        // Filtro por objetivo (solo en /servicios)
        var filters = document.querySelector('[data-sv-filters]');
        if (filters) {
            var btns = Array.prototype.slice.call(filters.querySelectorAll('.sv-filter'));
            var apply = function (goal) {
                btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-goal') === goal ? 'true' : 'false'); });
                var first = null;
                rows.forEach(function (li) {
                    var ok = goal === 'todos' || (li.getAttribute('data-goals') || '').split(' ').indexOf(goal) !== -1;
                    li.hidden = !ok;
                    if (ok && !first) first = li.getAttribute('data-slug');
                });
                if (first) show(first);
            };
            btns.forEach(function (b) { b.addEventListener('click', function () { apply(b.getAttribute('data-goal')); }); });
            var pre = new URLSearchParams(window.location.search).get('objetivo');
            if (pre && btns.some(function (b) { return b.getAttribute('data-goal') === pre; })) apply(pre);
        }
    }

    // Aparición progresiva: el estado oculto lo pone el script, así sin JS todo se ve
    var reveals = Array.prototype.slice.call(document.querySelectorAll('.sv-reveal'));
    var canAnimate = 'IntersectionObserver' in window && window.matchMedia('(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)').matches;
    if (canAnimate) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (en) {
                if (en.isIntersecting) { en.target.classList.remove('sv-hide'); io.unobserve(en.target); }
            });
        }, { threshold: 0.05, rootMargin: '0px 0px -6% 0px' });
        reveals.forEach(function (el) {
            if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('sv-hide'); }
            io.observe(el);
        });
    }

    // Analítica
    document.querySelectorAll('a[data-svc]').forEach(function (a) {
        a.addEventListener('click', function () {
            if (typeof window.va === 'function') window.va('event', { name: 'Service Click', data: { service: a.getAttribute('data-svc') } });
        });
    });
})();


// Comparador antes / después
document.querySelectorAll('[data-compare]').forEach((box) => {
    const range = box.querySelector('.sv-compare__range');
    if (!range) return;
    const set = () => box.style.setProperty('--pos', range.value + '%');
    range.addEventListener('input', set);
    set();
});
