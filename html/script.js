/* ===== HEADER SCROLL SHADOW ===== */
(function () {
  var header = document.getElementById('siteHeader');
  window.addEventListener('scroll', function () {
    header.style.boxShadow = window.scrollY > 60
      ? '0 2px 12px rgba(0,0,0,0.08)'
      : 'none';
  }, { passive: true });
})();

/* ===== PRODUCT CAROUSEL (infinite loop, 1 item per click) ===== */
(function () {
  var track = document.getElementById('productsTrack');
  var prevBtn = document.getElementById('prevBtn');
  var nextBtn = document.getElementById('nextBtn');
  var dotsWrap = document.getElementById('productsDots');
  if (!track || !prevBtn || !nextBtn) return;

  var realCards = Array.prototype.slice.call(track.children);
  var realCount = realCards.length;
  if (realCount === 0) return;

  // Clone the full set on both sides ([clones][real][clones]) so there's always
  // enough buffer to slide past either end, at any responsive item-count.
  var headClones = document.createDocumentFragment();
  var tailClones = document.createDocumentFragment();
  realCards.forEach(function (card) {
    var head = card.cloneNode(true);
    head.setAttribute('aria-hidden', 'true');
    headClones.appendChild(head);
    var tail = card.cloneNode(true);
    tail.setAttribute('aria-hidden', 'true');
    tailClones.appendChild(tail);
  });
  track.insertBefore(headClones, track.firstChild);
  track.appendChild(tailClones);

  var currentIndex = realCount; // start on the first real card

  function getCardWidth() {
    var card = track.children[0];
    if (!card) return 0;
    return card.getBoundingClientRect().width + 20;
  }

  function realIndex() {
    return ((currentIndex - realCount) % realCount + realCount) % realCount;
  }

  function renderDots() {
    if (!dotsWrap) return;
    if (dotsWrap.children.length !== realCount) {
      dotsWrap.innerHTML = '';
      for (var i = 0; i < realCount; i++) {
        var dot = document.createElement('button');
        dot.className = 'products__dot';
        dot.setAttribute('aria-label', (i + 1) + '번째 상품으로 이동');
        dot.addEventListener('click', (function (idx) {
          return function () { goTo(realCount + idx, true); };
        })(i));
        dotsWrap.appendChild(dot);
      }
    }
    var ri = realIndex();
    Array.prototype.forEach.call(dotsWrap.children, function (dot, i) {
      dot.classList.toggle('products__dot--active', i === ri);
    });
    dotsWrap.style.display = realCount <= 1 ? 'none' : '';
  }

  function goTo(index, animate) {
    currentIndex = index;
    track.style.transition = animate ? '' : 'none';
    if (!animate) void track.offsetHeight; // commit "no transition" before jumping
    track.style.transform = 'translateX(-' + (currentIndex * getCardWidth()) + 'px)';
    renderDots();
  }

  // Once a click slides into the cloned buffer, snap invisibly back to the
  // matching real position so the next click keeps sliding the same direction.
  track.addEventListener('transitionend', function (e) {
    if (e.target !== track || e.propertyName !== 'transform') return;
    if (currentIndex >= realCount * 2) {
      goTo(currentIndex - realCount, false);
    } else if (currentIndex < realCount) {
      goTo(currentIndex + realCount, false);
    }
  });

  prevBtn.addEventListener('click', function () { goTo(currentIndex - 1, true); });
  nextBtn.addEventListener('click', function () { goTo(currentIndex + 1, true); });

  window.addEventListener('resize', function () { goTo(currentIndex, false); });

  goTo(realCount, false);
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

  var css = '.reveal{opacity:0;transform:translateY(24px);transition:opacity .65s ease,transform .65s ease}.reveal.in{opacity:1;transform:none}' +
    '.reveal-left{opacity:0;transform:translateX(-24px);transition:opacity .65s ease,transform .65s ease}.reveal-left.in{opacity:1;transform:none}' +
    '.reveal-right{opacity:0;transform:translateX(24px);transition:opacity .65s ease,transform .65s ease}.reveal-right.in{opacity:1;transform:none}';
  var s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);

  var selectors = [
    '.tagline', '.about__body',
    '.collection-banner__body', '.cta-banner__body',
    '.features__inner', '.newsletter__inner',
  ];
  selectors.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el) { el.classList.add('reveal'); });
  });

  // Cartier LOVE split: image slides in from the left, text from the right.
  document.querySelectorAll('.category-split--love .category-split__img').forEach(function (el) { el.classList.add('reveal-left'); });
  document.querySelectorAll('.category-split--love .category-split__body').forEach(function (el) { el.classList.add('reveal-right'); });

  // Ribbon split is mirrored (image on the right) — reveal mirrors it too.
  document.querySelectorAll('.category-split--ribbon .category-split__img').forEach(function (el) { el.classList.add('reveal-right'); });
  document.querySelectorAll('.category-split--ribbon .category-split__body').forEach(function (el) { el.classList.add('reveal-left'); });

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(function (el) { io.observe(el); });
})();
