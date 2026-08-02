/* Shared header + footer injected into all inner pages */

const HEADER_HTML = `
<div class="announcement-bar" id="announcementBar">
  <div class="announcement-bar__content">
    <p>모든 제품 정품 인증서 + 오리지널 박스 동봉 <a href="about.html">정품 보증 안내</a></p>
  </div>
  <button class="announcement-bar__close" onclick="document.getElementById('announcementBar').remove()" aria-label="닫기">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
  </button>
</div>
<header class="site-header" id="siteHeader">
  <div class="header__topbar">
    <div class="header__topbar-inner">
      <button class="header__menu-toggle" id="menuToggle" aria-label="메뉴 열기" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <div class="header__logo">
        <a href="index.html" class="brand-wordmark">VELORA JEWELRY</a>
      </div>
      <div class="header__topbar-right">
        <a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="icon-btn" aria-label="인스타그램">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
        </a>
        <a href="wishlist.html" class="icon-btn icon-btn--relative" aria-label="위시리스트">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span class="icon-badge">0</span>
        </a>
        <a href="cart.html" class="icon-btn icon-btn--relative" aria-label="장바구니">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
          <span class="icon-badge">0</span>
        </a>
      </div>
    </div>
  </div>
  <nav class="header__nav" id="headerNav">
    <ul class="nav__list">
      <li><a href="jewelry.html" class="nav__link"><span class="nav__link-text">주얼리</span></a></li>
      <li><a href="watch.html" class="nav__link"><span class="nav__link-text">시계</span></a></li>
      <li><a href="about.html" class="nav__link"><span class="nav__link-text">정품 보증 안내</span></a></li>
      <li><a href="contact.html" class="nav__link nav__link--caps"><span class="nav__link-text">DM 문의</span></a></li>
      <li><a href="news.html" class="nav__link"><span class="nav__link-text">뉴스</span></a></li>
    </ul>
  </nav>
</header>
`;

const FOOTER_HTML = `
<footer class="site-footer">
  <div class="site-footer__body">
    <div class="footer-brand">
      <a href="index.html" class="brand-wordmark footer-brand__wordmark">VELORA JEWELRY</a>
      <p class="footer-brand__desc">Cartier, Tiffany &amp; Co. 등 정품 인증된 프리러브드(사전 소유) 럭셔리 주얼리를 엄선해 소개하는 편집숍입니다. 모든 제품은 정품 인증서와 오리지널 박스가 함께 제공됩니다.</p>
      <div class="footer-social">
        <a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="social-icon" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
      </div>
    </div>
    <div class="footer-col">
      <h4 class="footer-col-title">회사 소개</h4>
      <ul class="footer-col__links">
        <li><a href="about.html">정품 보증 안내</a></li>
        <li><a href="contact.html">문의하기</a></li>
        <li><a href="faqs.html">자주 묻는 질문</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4 class="footer-col-title">쇼핑</h4>
      <ul class="footer-col__links">
        <li><a href="jewelry.html">주얼리</a></li>
        <li><a href="watch.html">시계</a></li>
        <li><a href="wishlist.html">위시리스트</a></li>
        <li><a href="cart.html">장바구니</a></li>
        <li><a href="account.html">내 계정</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4 class="footer-col-title">연락하며 지내자</h4>
      <a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="footer-email">@velo.rajwlry</a>
    </div>
  </div>
  <div class="site-footer__legal">
    <p>Velora Jewelry는 Cartier 및 Tiffany &amp; Co.의 공식 대리점·파트너가 아닌 독립 리셀러입니다. 판매하는 모든 제품은 정품 확인 절차를 거친 정품 프리러브드(사전 소유) 주얼리이며, 오리지널 박스와 인증서가 함께 제공됩니다.</p>
  </div>
  <div class="site-footer__bottom">
    <div class="footer-bottom__locale">
      <button class="footer-locale-btn">대한민국 | KRW ₩ <svg width="9" height="5" viewBox="0 0 9 5"><path d="M0.5 0.5l4 4 4-4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <p class="footer-copyright">© 2026, Velora Jewelry. <a href="#">개인정보처리방침</a></p>
    <div class="footer-payments">
      <span class="payment-badge">카카오페이</span><span class="payment-badge">네이버페이</span><span class="payment-badge">계좌이체</span>
    </div>
  </div>
</footer>
<a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="kakao-float" aria-label="인스타그램 DM 문의">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3C1E1E" stroke-width="1.6"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
  <span>DM</span>
</a>
`;

const NEWSLETTER_HTML = `
<section class="newsletter">
  <div class="newsletter__inner">
    <h3 class="newsletter__heading">재입고 소식을 가장 먼저 받아보세요</h3>
    <p class="newsletter__sub">한 점씩만 입고되는 프리러브드 컬렉션 특성상, 인스타그램 DM으로 관심 제품을 남겨주시면 우선 안내해 드립니다.</p>
    <a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="newsletter__btn newsletter__btn--solo">인스타그램 팔로우하기</a>
  </div>
</section>
`;

document.addEventListener('DOMContentLoaded', function () {
  // Skip-to-content link (accessibility)
  var skipLink = document.createElement('a');
  skipLink.href = '#main-content';
  skipLink.className = 'skip-link';
  skipLink.textContent = '본문 바로가기';
  document.body.insertBefore(skipLink, document.body.firstChild);

  // Inject header directly as body children (no wrapper div) so
  // position:sticky on <header> isn't confined to a tiny containing block.
  skipLink.insertAdjacentHTML('afterend', HEADER_HTML);

  // Inject footer+newsletter before closing body
  var footerEl = document.createElement('div');
  var newsletterTarget = document.getElementById('newsletter-placeholder');
  if (newsletterTarget) {
    newsletterTarget.innerHTML = NEWSLETTER_HTML;
  }
  footerEl.innerHTML = FOOTER_HTML;
  document.body.appendChild(footerEl);

  // Scroll shadow on header
  window.addEventListener('scroll', function () {
    var h = document.getElementById('siteHeader');
    if (h) h.style.boxShadow = window.scrollY > 40 ? '0 2px 12px rgba(0,0,0,0.08)' : 'none';
  }, { passive: true });

  // Mark current page in nav
  var currentFile = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link').forEach(function (link) {
    var linkFile = link.getAttribute('href').split('#')[0].split('/').pop();
    if (linkFile === currentFile) link.setAttribute('aria-current', 'page');
  });

  // Mobile menu toggle
  var toggle = document.getElementById('menuToggle');
  var nav = document.getElementById('headerNav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('header__nav--open');
      toggle.classList.toggle('header__menu-toggle--open', isOpen);
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      document.body.classList.toggle('no-scroll', isOpen);
    });
  }
});
