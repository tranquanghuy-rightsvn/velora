/* ===== HEADER SCROLL SHADOW ===== */
(function () {
  var header = document.getElementById('siteHeader');
  window.addEventListener('scroll', function () {
    header.style.boxShadow = window.scrollY > 60
      ? '0 2px 12px rgba(0,0,0,0.08)'
      : 'none';
  }, { passive: true });
})();

/* ===== PRODUCT CAROUSEL ===== */
(function () {
  var track = document.getElementById('productsTrack');
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var dotsWrap = document.getElementById('productsDots');
  if (!track || !prevBtn || !nextBtn) return;

  var currentIndex = 0;

  function getVisibleCount() {
    var w = window.innerWidth;
    if (w <= 480) return 1;
    if (w <= 768) return 2;
    if (w <= 1024) return 3;
    return 4;
  }

  function getCardWidth() {
    var card = track.children[0];
    if (!card) return 0;
    return card.getBoundingClientRect().width + 20;
  }

  function renderDots(maxIndex) {
    if (!dotsWrap) return;
    var count = maxIndex + 1;
    if (dotsWrap.children.length !== count) {
      dotsWrap.innerHTML = '';
      for (var i = 0; i < count; i++) {
        var dot = document.createElement('button');
        dot.className = 'products__dot';
        dot.setAttribute('aria-label', (i + 1) + '번째 화면으로 이동');
        dot.addEventListener('click', (function (idx) {
          return function () { currentIndex = idx; update(); };
        })(i));
        dotsWrap.appendChild(dot);
      }
    }
    Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
      dot.classList.toggle('products__dot--active', i === currentIndex);
    });
    dotsWrap.style.display = count <= 1 ? 'none' : '';
  }

  function update() {
    var total = track.children.length;
    var maxIndex = Math.max(0, total - getVisibleCount());
    if (currentIndex > maxIndex) currentIndex = maxIndex;
    track.style.transform = 'translateX(-' + (currentIndex * getCardWidth()) + 'px)';
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex >= maxIndex;
    renderDots(maxIndex);
  }

  prevBtn.addEventListener('click', function () {
    if (currentIndex > 0) { currentIndex--; update(); }
  });
  nextBtn.addEventListener('click', function () {
    var maxIndex = track.children.length - getVisibleCount();
    if (currentIndex < maxIndex) { currentIndex++; update(); }
  });

  window.addEventListener('resize', update);
  update();
})();

/* ===== REVIEWS DRAG SCROLL ===== */
(function () {
  var el = document.getElementById('reviewsTrack');
  if (!el) return;

  el.style.overflowX = 'auto';
  el.style.scrollbarWidth = 'none';

  var isDown = false;
  var startX, scrollLeft;

  el.addEventListener('mousedown', function (e) {
    isDown = true;
    startX = e.pageX - el.offsetLeft;
    scrollLeft = el.scrollLeft;
  });
  window.addEventListener('mouseup', function () { isDown = false; });
  el.addEventListener('mousemove', function (e) {
    if (!isDown) return;
    e.preventDefault();
    el.scrollLeft = scrollLeft - (e.pageX - el.offsetLeft - startX) * 1.4;
  });

  var tx = 0, ts = 0;
  el.addEventListener('touchstart', function (e) { tx = e.touches[0].pageX; ts = el.scrollLeft; }, { passive: true });
  el.addEventListener('touchmove', function (e) {
    el.scrollLeft = ts + (tx - e.touches[0].pageX);
  }, { passive: true });
})();

/* ===== SCROLL REVEAL ===== */
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var css = '.reveal{opacity:0;transform:translateY(24px);transition:opacity .65s ease,transform .65s ease}.reveal.in{opacity:1;transform:none}';
  var s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);

  var selectors = [
    '.tagline', '.about__body', '.category-split__body',
    '.collection-banner__body', '.cta-banner__body',
    '.features__inner', '.newsletter__inner',
  ];
  selectors.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el) { el.classList.add('reveal'); });
  });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
})();
