/* Shared header + footer injected into all inner pages */

const HEADER_HTML = `
<div class="announcement-bar" id="announcementBar">
  <div class="announcement-bar__content">
    <p>오래도록 변치 않을 주얼리 디자인 <a href="index.html">더 보기</a></p>
  </div>
  <button class="announcement-bar__close" onclick="document.getElementById('announcementBar').remove()" aria-label="닫기">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
  </button>
</div>
<header class="site-header" id="siteHeader">
  <div class="header__topbar">
    <div class="header__topbar-inner">
      <div class="header__topbar-left">
        <button class="topbar-btn">
          <img src="https://cdn.shopify.com/static/images/flags/kr.svg" alt="대한민국" width="18" height="13" />
          대한민국 | KRW ₩
          <svg width="9" height="5" viewBox="0 0 9 5"><path d="M0.5 0.5l4 4 4-4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="topbar-btn">
          한국어
          <svg width="9" height="5" viewBox="0 0 9 5"><path d="M0.5 0.5l4 4 4-4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <a href="about.html" class="topbar-link">정보</a>
        <a href="contact.html" class="topbar-link">문의하기</a>
      </div>
      <div class="header__logo">
        <a href="index.html" class="brand-wordmark">VELORA JEWELRY</a>
      </div>
      <div class="header__topbar-right">
        <button class="icon-btn" aria-label="검색">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </button>
        <a href="account.html" class="icon-btn" aria-label="계정">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </a>
        <a href="wishlist.html" class="icon-btn icon-btn--relative" aria-label="위시리스트">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span class="icon-badge">0</span>
        </a>
        <a href="cart.html" class="icon-btn" aria-label="장바구니">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>
        </a>
      </div>
    </div>
  </div>
  <nav class="header__nav">
    <ul class="nav__list">
      <li><a href="#" class="nav__link">하이 주얼리</a></li>
      <li><a href="#" class="nav__link">주얼리</a></li>
      <li><a href="#" class="nav__link">시계</a></li>
      <li><a href="#" class="nav__link">가방 및 액세서리</a></li>
      <li><a href="#" class="nav__link nav__link--caps">CUSTOM ORDER</a></li>
      <li><a href="news.html" class="nav__link">뉴스</a></li>
    </ul>
  </nav>
</header>
`;

const FOOTER_HTML = `
<footer class="site-footer">
  <div class="site-footer__body">
    <div class="footer-brand">
      <h4 class="footer-col-title">저희 매장</h4>
      <p class="footer-brand__desc">하이엔드 감각으로 세심하게 제작된 프리미엄 럭셔리 주얼리를 만나보세요. 시대를 초월한 우아함과 완벽한 마감으로 당신의 일상 스타일에 품격을 더해드립니다.</p>
      <div class="footer-social">
        <a href="#" class="social-icon" aria-label="Facebook"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg></a>
        <a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="social-icon" aria-label="Instagram"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg></a>
        <a href="#" class="social-icon" aria-label="TikTok"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.34 6.34 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.5a8.18 8.18 0 004.78 1.52V6.54a4.85 4.85 0 01-1.01.15z"/></svg></a>
        <a href="#" class="social-icon" aria-label="X"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
      </div>
    </div>
    <div class="footer-col">
      <h4 class="footer-col-title">회사 소개</h4>
      <ul class="footer-col__links">
        <li><a href="about.html">정보</a></li>
        <li><a href="contact.html">문의하기</a></li>
        <li><a href="faqs.html">자주 묻는 질문</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4 class="footer-col-title">서비스</h4>
      <ul class="footer-col__links">
        <li><a href="cart.html">카트</a></li>
        <li><a href="account.html">내 계정</a></li>
        <li><a href="#">개인정보처리방침</a></li>
      </ul>
    </div>
    <div class="footer-col">
      <h4 class="footer-col-title">연락하며 지내자</h4>
      <a href="https://www.instagram.com/velo.rajwlry" target="_blank" rel="noopener" class="footer-email">@velo.rajwlry</a>
    </div>
  </div>
  <div class="site-footer__bottom">
    <div class="footer-bottom__locale">
      <button class="footer-locale-btn">대한민국 | KRW ₩ <svg width="9" height="5" viewBox="0 0 9 5"><path d="M0.5 0.5l4 4 4-4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <button class="footer-locale-btn">한국어 <svg width="9" height="5" viewBox="0 0 9 5"><path d="M0.5 0.5l4 4 4-4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </div>
    <p class="footer-copyright">© 2026, Velora Jewelry. <a href="#">개인정보처리방침</a></p>
    <div class="footer-payments">
      <span class="payment-badge">AMEX</span><span class="payment-badge">Apple Pay</span><span class="payment-badge">G Pay</span><span class="payment-badge">MC</span><span class="payment-badge">Shop Pay</span><span class="payment-badge">Union Pay</span><span class="payment-badge">VISA</span>
    </div>
  </div>
</footer>
<a href="#" class="kakao-float" aria-label="카카오톡 문의">
  <svg width="26" height="24" viewBox="0 0 26 24" fill="#3C1E1E"><path d="M13 0C5.82 0 0 4.70 0 10.5c0 3.74 2.36 7.03 5.93 8.97L4.5 24l5.8-3.07A15.5 15.5 0 0013 21c7.18 0 13-4.70 13-10.5S20.18 0 13 0z"/></svg>
  <span>TALK</span>
</a>
`;

const NEWSLETTER_HTML = `
<section class="newsletter">
  <div class="newsletter__inner">
    <h3 class="newsletter__heading">뉴스레터를 구독하세요</h3>
    <p class="newsletter__sub">새로운 컬렉션과 독점적인 혜택에 대해 가장 먼저 알아보세요.</p>
    <form class="newsletter__form" onsubmit="return false;">
      <input type="email" class="newsletter__input" placeholder="이메일 주소를 입력하세요" />
      <button type="submit" class="newsletter__btn">구독하기</button>
    </form>
  </div>
</section>
`;

document.addEventListener('DOMContentLoaded', function () {
  // Inject header before body content
  var headerEl = document.createElement('div');
  headerEl.innerHTML = HEADER_HTML;
  document.body.insertBefore(headerEl, document.body.firstChild);

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
});
