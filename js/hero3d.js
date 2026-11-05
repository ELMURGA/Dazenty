// Hero 3D: una nube de partículas que empieza como esfera y se transforma en el logo de Dazenty
// ("ideas que transforman realidades"). Reacciona al cursor.
// Se carga tras pintar la página; si no hay WebGL o el equipo va justo, la web sigue igual.
(function () {
    'use strict';

    var canvas = document.getElementById('hero3d');
    var hero = document.getElementById('inicio');
    if (!canvas || !hero) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (navigator.connection && navigator.connection.saveData) return;

    var isTouch = window.matchMedia('(pointer: coarse)').matches;
    var lowPower = (navigator.deviceMemory && navigator.deviceMemory < 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4);
    var COUNT = isTouch || lowPower ? 5000 : 14000;

    function start() {
        Promise.all([import('/js/vendor/three.module.min.js'), logoPoints()]).then(function (r) { init(r[0], r[1]); }).catch(function () { /* sin 3D */ });
    }
    // Esperar a que el navegador esté libre: no compite con el primer pintado
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 1200);

    // Puntos que forman el logo: se muestrea la silueta (canal alfa) de la imagen
    function logoPoints() {
        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                var N = 400, c = document.createElement('canvas'); c.width = c.height = N;
                var ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, N, N);
                var d = ctx.getImageData(0, 0, N, N).data, pts = [];
                for (var y = 0; y < N; y += 1) for (var x = 0; x < N; x += 1) if (d[(y * N + x) * 4 + 3] > 128) pts.push(x, y);
                if (pts.length < 200) { resolve(null); return; }
                var out = new Float32Array(COUNT * 3), k = 0, sc = 4.6 / 295;
                for (var i = 0; i < COUNT; i++) {
                    var j = Math.floor(Math.random() * (pts.length / 2)) * 2;
                    out[k++] = (pts[j] + Math.random() - 193) * sc;
                    out[k++] = -(pts[j + 1] + Math.random() - 204) * sc;
                    out[k++] = (Math.random() - 0.5) * 0.28;
                }
                resolve(out);
            };
            img.onerror = function () { resolve(null); };
            img.src = '/img/logoheader.webp';
        });
    }

    function init(THREE, logo) {
        var renderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
        } catch (e) { return; }

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.z = 7;

        // --- Tres formas para las mismas partículas ---
        var sphere = new Float32Array(COUNT * 3);
        var seed = new Float32Array(COUNT);
        var golden = Math.PI * (3 - Math.sqrt(5));
        for (var i = 0; i < COUNT; i++) {
            var k = i * 3;
            // esfera (espiral áurea)
            var y = 1 - (i / (COUNT - 1)) * 2;
            var rad = Math.sqrt(1 - y * y);
            var th = golden * i;
            sphere[k] = Math.cos(th) * rad * 2.1;
            sphere[k + 1] = y * 2.1;
            sphere[k + 2] = Math.sin(th) * rad * 2.1;
            seed[i] = Math.random();
        }

        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(sphere, 3));
        geo.setAttribute('aLogo', new THREE.BufferAttribute(logo || sphere, 3));
        geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

        var mat = new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
                uMorph: { value: 0 },
                uTime: { value: 0 },
                uMouse: { value: new THREE.Vector3(99, 99, 0) },
                uSize: { value: 1 },
                uAlpha: { value: 0 },
            },
            vertexShader: [
                'attribute vec3 aLogo; attribute float aSeed;',
                'uniform float uMorph, uTime, uSize; uniform vec3 uMouse;',
                'varying float vDepth; varying float vSeed;',
                'void main() {',
                '  float m = smoothstep(0.0, 1.0, clamp(uMorph, 0.0, 1.0));',
                '  float k = clamp(m * 1.25 - aSeed * 0.25, 0.0, 1.0);',
                '  vec3 p = mix(position, aLogo, k);',
                '  p += normalize(p + 0.001) * sin(uTime * 0.9 + aSeed * 40.0) * mix(0.045, 0.012, k);',
                '  vec4 world = modelMatrix * vec4(p, 1.0);',
                '  vec3 d = world.xyz - uMouse; float dist = length(d.xy);',
                '  world.xyz += normalize(vec3(d.xy, 0.4)) * smoothstep(1.6, 0.0, dist) * 0.55;',
                '  vec4 mv = viewMatrix * world;',
                '  vDepth = clamp((-mv.z - 4.5) / 5.0, 0.0, 1.0); vSeed = aSeed;',
                '  gl_PointSize = uSize * (0.8 + aSeed * 1.1) * (24.0 / -mv.z);',
                '  gl_Position = projectionMatrix * mv;',
                '}',
            ].join('\n'),
            fragmentShader: [
                'precision mediump float; uniform float uAlpha; varying float vDepth; varying float vSeed;',
                'void main() {',
                '  vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;',
                '  vec3 coral = vec3(0.851, 0.467, 0.384); vec3 warm = vec3(1.0, 0.86, 0.80);',
                '  vec3 col = mix(warm, coral, clamp(vDepth * 1.3 + vSeed * 0.35, 0.0, 1.0));',
                '  gl_FragColor = vec4(col, smoothstep(0.5, 0.05, d) * (0.95 - vDepth * 0.55) * uAlpha);',
                '}',
            ].join('\n'),
        });

        var points = new THREE.Points(geo, mat);
        scene.add(points);

        // --- Tamaño y encuadre ---
        var dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 1.75);
        function resize() {
            var w = hero.clientWidth, h = hero.clientHeight;
            renderer.setPixelRatio(dpr);
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            // En pantallas estrechas el objeto se aleja para no desbordar
            camera.position.z = w / h < 0.9 ? 10.5 : (w / h < 1.4 ? 8.5 : 7);
            camera.updateProjectionMatrix();
            mat.uniforms.uSize.value = dpr * (w < 700 ? 0.85 : 1.15);
        }
        resize();
        window.addEventListener('resize', resize);

        // --- Interacción ---
        var target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
        var ray = new THREE.Vector3();
        window.addEventListener('pointermove', function (e) {
            var rect = hero.getBoundingClientRect();
            var nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            var ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
            target.x = nx; target.y = ny;
            ray.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
            var t = -camera.position.z / ray.z;
            mat.uniforms.uMouse.value.copy(camera.position).addScaledVector(ray, t);
        }, { passive: true });

        // --- Bucle (solo corre mientras el hero se ve) ---
        var visible = true, raf = 0, last = performance.now(), fade = 0, clock = 0, spin = 0;
        new IntersectionObserver(function (en) {
            visible = en[0].isIntersecting;
            if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
        }, { threshold: 0 }).observe(hero);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden && visible && !raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
        });

        function frame(now) {
            raf = 0;
            if (!visible || document.hidden) return;
            var dt = Math.min((now - last) / 1000, 0.05); last = now;
            mat.uniforms.uTime.value += dt;

            // Línea de tiempo: esfera al cargar y, tras un momento, se convierte en el logo
            var rect = hero.getBoundingClientRect();
            var p = Math.min(Math.max(-rect.top / (rect.height * 0.9), 0), 1);
            clock += dt;
            var targetMorph = logo && clock > 1.6 ? 1 : 0;
            mat.uniforms.uMorph.value += (targetMorph - mat.uniforms.uMorph.value) * Math.min(dt * 1.1, 1);
            var m = mat.uniforms.uMorph.value;

            cur.x += (target.x - cur.x) * Math.min(dt * 3, 1);
            cur.y += (target.y - cur.y) * Math.min(dt * 3, 1);
            // Gira como esfera; al formarse el logo se queda de frente (con una ligera inclinación al cursor)
            spin += dt * 0.12;
            var wrapped = ((spin + Math.PI) % (Math.PI * 2)) - Math.PI;
            points.rotation.y = wrapped * (1 - m) + cur.x * 0.3 * m;
            points.rotation.x += ((-cur.y * 0.35 * m) - points.rotation.x) * Math.min(dt * 2.5, 1);
            points.rotation.z = 0;

            fade = Math.min(fade + dt * 0.8, 1);
            mat.uniforms.uAlpha.value = fade * (0.5 + 0.12 * m) * (1 - p * 0.6);

            renderer.render(scene, camera);
            raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
        hero.classList.add('has-3d');
    }
})();
