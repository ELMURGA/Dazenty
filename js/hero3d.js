// Hero 3D: una nube de partículas que se transforma de esfera a cubo y a toroide
// ("ideas que transforman realidades") y reacciona al cursor.
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
        import('/js/vendor/three.module.min.js').then(function (THREE) { init(THREE); }).catch(function () { /* sin 3D */ });
    }
    // Esperar a que el navegador esté libre: no compite con el primer pintado
    if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 2500 });
    else setTimeout(start, 1200);

    function init(THREE) {
        var renderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
        } catch (e) { return; }

        var scene = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        camera.position.z = 7;

        // --- Tres formas para las mismas partículas ---
        var sphere = new Float32Array(COUNT * 3);
        var cube = new Float32Array(COUNT * 3);
        var torus = new Float32Array(COUNT * 3);
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
            // cubo (puntos sobre las caras)
            var face = Math.floor(Math.random() * 6);
            var a = (Math.random() * 2 - 1) * 1.7, b = (Math.random() * 2 - 1) * 1.7, s = face % 2 ? 1.7 : -1.7;
            if (face < 2) { cube[k] = s; cube[k + 1] = a; cube[k + 2] = b; }
            else if (face < 4) { cube[k] = a; cube[k + 1] = s; cube[k + 2] = b; }
            else { cube[k] = a; cube[k + 1] = b; cube[k + 2] = s; }
            // toroide
            var u = Math.random() * Math.PI * 2, v = Math.random() * Math.PI * 2;
            var R = 1.9, r = 0.7;
            torus[k] = (R + r * Math.cos(v)) * Math.cos(u);
            torus[k + 1] = r * Math.sin(v) * 1.2;
            torus[k + 2] = (R + r * Math.cos(v)) * Math.sin(u);
            seed[i] = Math.random();
        }

        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(sphere, 3));
        geo.setAttribute('aCube', new THREE.BufferAttribute(cube, 3));
        geo.setAttribute('aTorus', new THREE.BufferAttribute(torus, 3));
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
                'attribute vec3 aCube; attribute vec3 aTorus; attribute float aSeed;',
                'uniform float uMorph, uTime, uSize; uniform vec3 uMouse;',
                'varying float vDepth; varying float vSeed;',
                'void main() {',
                '  float m = clamp(uMorph, 0.0, 2.0);',
                '  vec3 p = m < 1.0 ? mix(position, aCube, smoothstep(0.0, 1.0, m)) : mix(aCube, aTorus, smoothstep(0.0, 1.0, m - 1.0));',
                '  p += normalize(p + 0.001) * sin(uTime * 0.9 + aSeed * 40.0) * 0.045;',
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
        var visible = true, raf = 0, last = performance.now(), fade = 0;
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

            // Progreso de scroll dentro del hero: 0 = esfera, 1 = cubo, 2 = toroide
            var rect = hero.getBoundingClientRect();
            var p = Math.min(Math.max(-rect.top / (rect.height * 0.9), 0), 1);
            var targetMorph = p * 2;
            mat.uniforms.uMorph.value += (targetMorph - mat.uniforms.uMorph.value) * Math.min(dt * 4, 1);

            cur.x += (target.x - cur.x) * Math.min(dt * 3, 1);
            cur.y += (target.y - cur.y) * Math.min(dt * 3, 1);
            points.rotation.y += dt * 0.12;
            points.rotation.x += ((-cur.y * 0.45) - points.rotation.x) * Math.min(dt * 2.5, 1);
            points.rotation.z = cur.x * 0.15;

            fade = Math.min(fade + dt * 0.8, 1);
            mat.uniforms.uAlpha.value = fade * 0.5 * (1 - p * 0.5);

            renderer.render(scene, camera);
            raf = requestAnimationFrame(frame);
        }
        raf = requestAnimationFrame(frame);
        hero.classList.add('has-3d');
    }
})();
