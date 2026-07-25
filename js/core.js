/* =========================================================
   core.js — 3D «ядро автоматизации»
   Икосаэдр на canvas 2D с честной 3D-математикой: поворот,
   перспектива, сортировка граней по глубине, плоское затенение
   двумя источниками света. Скролл «скрабит» раскадровку:
   вращение → разбор на модули → сборка и схлопывание в точку.
   Внешних библиотек нет.
   ========================================================= */
(function () {
  'use strict';

  /* ---------- Геометрия: икосаэдр ---------- */
  var PHI = (1 + Math.sqrt(5)) / 2;
  var K = Math.sqrt(1 + PHI * PHI);            // нормировка к радиусу 1

  var VERTS = [
    [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
    [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
    [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
  ].map(function (v) { return [v[0] / K, v[1] / K, v[2] / K]; });

  var FACES = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  /* Центроид грани = её внешняя нормаль (тело выпуклое и в нуле) */
  var FNORM = FACES.map(function (f) {
    var a = VERTS[f[0]], b = VERTS[f[1]], c = VERTS[f[2]];
    var x = (a[0] + b[0] + c[0]) / 3;
    var y = (a[1] + b[1] + c[1]) / 3;
    var z = (a[2] + b[2] + c[2]) / 3;
    var l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });

  /* ---------- Кольца орбитальных частиц ---------- */
  var RINGS = [
    { r: 1.18, tilt: 0.34, roll: 0.20, spin: 0.00022, n: 46, size: 1.6 },
    { r: 1.42, tilt: -0.66, roll: 0.95, spin: -0.00015, n: 38, size: 1.3 },
    { r: 1.68, tilt: 1.18, roll: -0.45, spin: 0.00010, n: 30, size: 1.1 }
  ];

  /* ---------- Свет ---------- */
  function unit(v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  var L_KEY = unit([-0.45, -0.72, 0.55]);   // ключевой, фиолетово-белый
  var L_RIM = unit([0.68, 0.30, 0.66]);     // контровой, синий

  /* PERSP — «фокусное расстояние». Проекция делит на (PERSP - z), поэтому
     значение должно с запасом превышать максимальный z сцены (у внешнего
     кольца это ~2.2), иначе ближние точки улетают за пределы экрана. */
  var PERSP = 5.5;
  var PUSH = 0.65;    // на сколько радиусов грани разлетаются при раскрытии

  /* ---------- Утилиты раскадровки ---------- */
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }
  function seg(p, a, b) { return clamp01((p - a) / (b - a)); }
  function ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  /* Единая раскадровка: её же читает CSS через --e / --out */
  function story(p) {
    var open = ease(seg(p, 0.14, 0.52));    // раскрытие
    var close = ease(seg(p, 0.74, 0.96));   // обратная сборка
    var grow = ease(seg(p, 0.00, 0.55));
    var shrink = ease(seg(p, 0.68, 1.00));

    return {
      explode: open * (1 - close),
      scale: 1 + grow * 0.14 - shrink * 0.85,
      spin: p * Math.PI * 2.35,
      out: seg(p, 0.82, 1.00)
    };
  }
  window.heroStory = story;

  /* ---------- Повороты ---------- */
  function rotY(v, c, s) { return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; }
  function rotX(v, c, s) { return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; }
  function rotZ(v, c, s) { return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }

  window.initCore = function (canvas) {
    var ctx = canvas.getContext('2d');
    var w = 0, h = 0, dpr = 1;
    var anchorY = null;                 // куда целиться центром (задаётся снаружи)

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* Буферы переиспользуем, чтобы не мусорить в GC каждый кадр */
    var rv = new Array(12);
    var order = [];
    for (var i = 0; i < 20; i++) order.push({ i: 0, z: 0 });

    function render(p, mx, my, time) {
      var st = story(p);
      ctx.clearRect(0, 0, w, h);
      if (st.scale <= 0.02 || st.out >= 1) return st;

      var cx = w / 2 + mx * 20;
      var cy = (anchorY === null ? h * 0.46 : anchorY) - p * 45 + my * 16;
      /* Берём минимум из двух долей, чтобы ядро не расползалось
         ни на широком мониторе, ни на вертикальном телефоне */
      var R = Math.min(w * 0.30, h * 0.25) * st.scale;
      var ex = st.explode;

      var yaw = time * 0.00013 + st.spin;
      var pitch = -0.30 + my * 0.20 + p * 0.40;
      var cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
      var cpit = Math.cos(pitch), spit = Math.sin(pitch);

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      var alpha = 1 - st.out;

      /* --- вершины в видовых координатах --- */
      for (var v = 0; v < 12; v++) {
        rv[v] = rotX(rotY(VERTS[v], cyaw, syaw), cpit, spit);
      }

      function proj(x, y, z) {
        var k = PERSP / (PERSP - z) * R;
        return [cx + x * k, cy + y * k];
      }

      /* --- орбитальные частицы: считаем один раз, рисуем в два прохода --- */
      var dots = [];
      for (var r = 0; r < RINGS.length; r++) {
        var ring = RINGS[r];
        var rad = ring.r * (1 + ex * 0.15);
        var off = time * ring.spin + p * 2.2 * (r % 2 ? -1 : 1);
        var ct = Math.cos(ring.tilt), stl = Math.sin(ring.tilt);
        var cr = Math.cos(ring.roll), sr = Math.sin(ring.roll);

        for (var d = 0; d < ring.n; d++) {
          var a = off + d / ring.n * Math.PI * 2;
          var q = rotZ(rotX([Math.cos(a) * rad, 0, Math.sin(a) * rad], ct, stl), cr, sr);
          q = rotX(rotY(q, cyaw, syaw), cpit, spit);
          var pt = proj(q[0], q[1], q[2]);
          dots.push({ x: pt[0], y: pt[1], z: q[2], s: ring.size });
        }
      }

      function drawDots(front) {
        for (var i = 0; i < dots.length; i++) {
          var o = dots[i];
          if ((o.z >= 0) !== front) continue;
          var depth = (o.z + 2.0) / 4.0;                    // 0…1 от дальнего к ближнему
          var a = (0.10 + depth * 0.75) * (0.45 + ex * 0.55) * alpha;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.s * (0.5 + depth), 0, 6.2832);
          ctx.fillStyle = 'rgba(183,155,255,' + a.toFixed(3) + ')';
          ctx.fill();
        }
      }

      drawDots(false);

      /* --- грани: сортировка по глубине (алгоритм художника) --- */
      for (var f = 0; f < 20; f++) {
        var n = FNORM[f];
        var rn = rotX(rotY(n, cyaw, syaw), cpit, spit);
        order[f].i = f;
        order[f].z = rn[2] * (1 + ex * PUSH);
        order[f].n = rn;
      }
      order.sort(function (a, b) { return a.z - b.z; });

      var nucleusDrawn = false;

      for (var k = 0; k < 20; k++) {
        var item = order[k];

        if (!nucleusDrawn && item.z >= 0) {
          drawNucleus();
          nucleusDrawn = true;
        }

        var face = FACES[item.i];
        var rn2 = item.n;
        var push = ex * PUSH;
        var ox = rn2[0] * push, oy = rn2[1] * push, oz = rn2[2] * push;

        var p0 = proj(rv[face[0]][0] + ox, rv[face[0]][1] + oy, rv[face[0]][2] + oz);
        var p1 = proj(rv[face[1]][0] + ox, rv[face[1]][1] + oy, rv[face[1]][2] + oz);
        var p2 = proj(rv[face[2]][0] + ox, rv[face[2]][1] + oy, rv[face[2]][2] + oz);

        var d1 = Math.max(0, rn2[0] * L_KEY[0] + rn2[1] * L_KEY[1] + rn2[2] * L_KEY[2]);
        var d2 = Math.max(0, rn2[0] * L_RIM[0] + rn2[1] * L_RIM[1] + rn2[2] * L_RIM[2]);
        var lit = Math.pow(d1, 1.35);

        var cr2 = Math.min(255, 16 + lit * 190 + d2 * 46);
        var cg2 = Math.min(255, 11 + lit * 158 + d2 * 96);
        var cb2 = Math.min(255, 42 + lit * 255 + d2 * 190);

        var faceA = (0.90 - ex * 0.14) * alpha;

        /* лёгкий градиент по грани — даёт «стеклянный» объём */
        var g = ctx.createLinearGradient(p0[0], p0[1], (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2);
        g.addColorStop(0, 'rgba(' + (cr2 | 0) + ',' + (cg2 | 0) + ',' + (cb2 | 0) + ',' + faceA.toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + (cr2 * 0.42 | 0) + ',' + (cg2 * 0.38 | 0) + ',' + (cb2 * 0.55 | 0) + ',' + faceA.toFixed(3) + ')');

        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();

        ctx.lineWidth = 1.1;
        ctx.strokeStyle = 'rgba(198,175,255,' + ((0.12 + lit * 0.72) * alpha).toFixed(3) + ')';
        if (lit > 0.62) {
          ctx.shadowColor = 'rgba(140,110,255,.9)';
          ctx.shadowBlur = 14 * lit;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      if (!nucleusDrawn) drawNucleus();

      drawDots(true);

      /* --- узлы-вершины поверх всего --- */
      ctx.globalCompositeOperation = 'lighter';
      for (var q2 = 0; q2 < 12; q2++) {
        var vv = rv[q2];
        if (vv[2] < -0.15) continue;
        var grow = 1 + ex * PUSH;
        var pp = proj(vv[0] * grow, vv[1] * grow, vv[2] * grow);
        var na = (0.25 + (vv[2] + 1) * 0.32) * alpha;
        ctx.beginPath();
        ctx.arc(pp[0], pp[1], 2.1 + ex * 1.4, 0, 6.2832);
        ctx.fillStyle = 'rgba(226,214,255,' + na.toFixed(3) + ')';
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      return st;

      /* ---- ядро свечения + лучи к граням ---- */
      function drawNucleus() {
        var pulse = 0.85 + Math.sin(time * 0.0016) * 0.15;
        var nr = R * (0.34 + ex * 0.62) * pulse;

        ctx.globalCompositeOperation = 'lighter';

        var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, nr);
        rg.addColorStop(0, 'rgba(255,252,255,' + (0.55 * (0.35 + ex * 0.65) * alpha).toFixed(3) + ')');
        rg.addColorStop(0.28, 'rgba(163,128,255,' + (0.42 * (0.3 + ex * 0.7) * alpha).toFixed(3) + ')');
        rg.addColorStop(0.65, 'rgba(96,74,220,' + (0.16 * alpha).toFixed(3) + ')');
        rg.addColorStop(1, 'rgba(75,123,255,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, nr, 0, 6.2832);
        ctx.fillStyle = rg;
        ctx.fill();

        /* лучи от ядра к разлетевшимся граням */
        if (ex > 0.01) {
          ctx.lineWidth = 1;
          for (var i = 0; i < 20; i++) {
            var n2 = order[i].n;
            var g2 = 1 + ex * PUSH;
            var t = proj(n2[0] * g2, n2[1] * g2, n2[2] * g2);
            var lg = ctx.createLinearGradient(cx, cy, t[0], t[1]);
            lg.addColorStop(0, 'rgba(196,172,255,' + (0.40 * ex * alpha).toFixed(3) + ')');
            lg.addColorStop(1, 'rgba(124,92,255,0)');
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(t[0], t[1]);
            ctx.strokeStyle = lg;
            ctx.stroke();
          }
        }

        ctx.globalCompositeOperation = 'source-over';
      }
    }

    return {
      render: render,
      setAnchor: function (y) { anchorY = y; },
      getCenterY: function (p) {
        return (anchorY === null ? h * 0.46 : anchorY) - p * 70;
      }
    };
  };
})();
