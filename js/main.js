/* =========================================================
   main.js
   1) Прогресс прокрутки hero -> CSS-переменная --p (0…1)
      с инерцией (lerp), чтобы движение было «дорогим», плавным.
   2) Параллакс от курсора -> --mx / --my.
   3) Появление секций по прокрутке (IntersectionObserver).
   Всё пишется в CSS-переменные внутри одного requestAnimationFrame.
   ========================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var scene   = document.getElementById('heroScene');
  var hero    = document.getElementById('hero');
  var nav     = document.getElementById('nav');
  var bar     = document.querySelector('.progress__bar');
  var canvas  = document.getElementById('constellation');

  if (canvas && window.initConstellation) window.initConstellation(canvas);

  /* ---------- 1. Прогресс прокрутки ---------- */
  var target = 0;   // целевое значение прогресса
  var current = 0;  // текущее (сглаженное)
  var pageP = 0;    // прогресс всей страницы для верхней полоски
  var pageCurrent = 0;

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function measure() {
    if (scene && hero) {
      // сколько прокрутили внутри sticky-сцены
      var distance = scene.offsetHeight - hero.offsetHeight;
      var passed = -scene.getBoundingClientRect().top;
      target = distance > 0 ? clamp01(passed / distance) : 0;
    }
    var docH = document.documentElement.scrollHeight - window.innerHeight;
    pageP = docH > 0 ? clamp01(window.scrollY / docH) : 0;

    if (nav) nav.classList.toggle('is-stuck', window.scrollY > 40);
  }

  /* ---------- 2. Параллакс от курсора ---------- */
  var mxT = 0, myT = 0, mx = 0, my = 0;

  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    window.addEventListener('mousemove', function (e) {
      mxT = (e.clientX / window.innerWidth - 0.5) * 2;   // -1 … 1
      myT = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  /* ---------- Единый кадр отрисовки ---------- */
  var EASE = 0.12;   // инерция: меньше — «тяжелее» и плавнее

  function frame() {
    measure();

    if (reduced) {
      current = target;
      pageCurrent = pageP;
      mx = mxT; my = myT;
    } else {
      current     += (target - current) * EASE;
      pageCurrent += (pageP - pageCurrent) * 0.18;
      mx += (mxT - mx) * 0.06;
      my += (myT - my) * 0.06;
    }

    if (hero) {
      hero.style.setProperty('--p',  current.toFixed(4));
      hero.style.setProperty('--mx', mx.toFixed(3));
      hero.style.setProperty('--my', my.toFixed(3));
    }
    if (bar) bar.style.setProperty('--sp', pageCurrent.toFixed(4));

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- 3. Появление секций ---------- */
  var items = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);   // анимируем один раз
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });

    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('is-visible'); });
  }
})();
