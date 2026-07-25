/* =========================================================
   constellation.js
   Фон hero: дрейфующие точки + линии между близкими точками
   (эффект «созвездий» как на референсе). Без зависимостей.
   ========================================================= */
(function () {
  'use strict';

  function init(canvas) {
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext('2d');
    var dots = [];
    var w = 0, h = 0, dpr = 1;
    var running = true;
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var LINK_DIST = 150;      // радиус связи между точками
    var SPEED = 0.12;         // базовая скорость дрейфа

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function build() {
      // плотность зависит от площади, но с потолком для мобильных
      var count = Math.min(110, Math.round((w * h) / 16000));
      dots = [];
      for (var i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * SPEED,
          vy: (Math.random() - 0.5) * SPEED,
          r: Math.random() * 1.4 + 0.5,
          // часть точек — «яркие звёзды» с пульсацией
          bright: Math.random() > 0.85,
          phase: Math.random() * Math.PI * 2
        });
      }
    }

    function draw(t) {
      ctx.clearRect(0, 0, w, h);

      var i, j, a, b, dx, dy, dist;

      // линии
      for (i = 0; i < dots.length; i++) {
        a = dots[i];
        for (j = i + 1; j < dots.length; j++) {
          b = dots[j];
          dx = a.x - b.x;
          dy = a.y - b.y;
          dist = dx * dx + dy * dy;
          if (dist < LINK_DIST * LINK_DIST) {
            var alpha = (1 - Math.sqrt(dist) / LINK_DIST) * 0.28;
            ctx.strokeStyle = 'rgba(150,140,220,' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // точки
      for (i = 0; i < dots.length; i++) {
        a = dots[i];
        var pulse = a.bright ? 0.65 + Math.sin(t / 900 + a.phase) * 0.35 : 0.4;
        ctx.beginPath();
        ctx.arc(a.x, a.y, a.bright ? a.r * 1.6 : a.r, 0, Math.PI * 2);
        ctx.fillStyle = a.bright
          ? 'rgba(210,200,255,' + pulse.toFixed(2) + ')'
          : 'rgba(255,255,255,' + pulse.toFixed(2) + ')';
        ctx.fill();

        if (a.bright) {
          ctx.beginPath();
          ctx.arc(a.x, a.y, a.r * 6, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(140,110,255,0.05)';
          ctx.fill();
        }
      }
    }

    function step(dt) {
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        // мягкий «телепорт» через границы
        if (d.x < -20) d.x = w + 20; else if (d.x > w + 20) d.x = -20;
        if (d.y < -20) d.y = h + 20; else if (d.y > h + 20) d.y = -20;
      }
    }

    var last = 0;
    function loop(now) {
      if (!last) last = now;
      var dt = Math.min((now - last) / 16.67, 3); // в кадрах, с ограничением
      last = now;
      if (running) {
        step(dt);
        draw(now);
      }
      requestAnimationFrame(loop);
    }

    resize();

    if (reduced) {
      draw(0);                                  // статичная картинка
    } else {
      requestAnimationFrame(loop);
      // не тратим кадры, когда hero ушёл с экрана
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          running = entries[0].isIntersecting;
          last = 0;
        }, { threshold: 0 }).observe(canvas);
      }
      document.addEventListener('visibilitychange', function () {
        last = 0;
      });
    }

    var rt;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        resize();
        if (reduced) draw(0);
      }, 150);
    });
  }

  window.initConstellation = init;
})();
