/* Client-side cart: no backend, persisted in localStorage */
(function () {
  var STORAGE_KEY = 'velora_cart';

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function parsePrice(text) {
    return parseInt(String(text || '').replace(/[^0-9]/g, ''), 10) || 0;
  }

  function updateBadges() {
    var count = getCart().length;
    document.querySelectorAll('.icon-btn[aria-label="장바구니"] .icon-badge').forEach(function (el) {
      el.textContent = count;
    });
  }

  function showToast(message) {
    var toast = document.getElementById('cartToast');
    if (!toast) {
      var css = '#cartToast{position:fixed;top:20px;right:20px;z-index:9999;display:flex;align-items:center;gap:8px;' +
        'background:#0d0d0d;color:#fff;font-size:13.5px;font-weight:500;padding:14px 20px;border-radius:4px;' +
        'box-shadow:0 4px 16px rgba(0,0,0,0.18);opacity:0;transform:translateY(-20px);pointer-events:none;}' +
        '#cartToast.is-visible{animation:cartToastPulse 2s ease forwards;}' +
        '#cartToast svg{flex-shrink:0;color:#fff;}' +
        '@keyframes cartToastPulse{' +
          '0%{opacity:0;transform:translateY(-20px);}' +
          '10%{opacity:1;transform:translateY(0);}' +
          '88%{opacity:1;transform:translateY(0);}' +
          '100%{opacity:0;transform:translateY(-10px);}' +
        '}';
      var style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
      toast = document.createElement('div');
      toast.id = 'cartToast';
      toast.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg><span class="cart-toast__text"></span>';
      document.body.appendChild(toast);
    }
    toast.querySelector('.cart-toast__text').textContent = message;
    // Restart the animation even if it's already mid-flight (e.g. rapid repeat clicks).
    toast.classList.remove('is-visible');
    void toast.offsetWidth;
    toast.classList.add('is-visible');
  }

  function addItem(id, meta, qty) {
    qty = qty || 1;
    var items = getCart();
    var existing = items.find(function (it) { return it.id === id; });
    if (existing) {
      existing.qty += qty;
    } else {
      items.push(Object.assign({ id: id, qty: qty }, meta));
    }
    saveCart(items);
    updateBadges();
  }

  function setQty(id, qty) {
    var items = getCart();
    var idx = items.findIndex(function (it) { return it.id === id; });
    if (idx === -1) return;
    if (qty <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx].qty = qty;
    }
    saveCart(items);
    updateBadges();
    renderCartPage();
  }

  function removeItem(id) {
    setQty(id, 0);
  }

  function showPaymentError(msg) {
    var errEl = document.getElementById('cartPaymentError');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = msg ? '' : 'none';
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** Reads + validates the shipping-info fields. Returns null (and shows an error) if invalid. */
  function collectCheckoutInfo() {
    var name = (document.getElementById('checkoutName') || {}).value || '';
    var phone = (document.getElementById('checkoutPhone') || {}).value || '';
    var email = (document.getElementById('checkoutEmail') || {}).value || '';
    var address = (document.getElementById('checkoutAddress') || {}).value || '';
    var website = (document.getElementById('checkoutWebsite') || {}).value || ''; // honeypot
    name = name.trim(); phone = phone.trim(); email = email.trim(); address = address.trim();

    if (!name) { showPaymentError('성함을 입력해주세요.'); return null; }
    if (!phone) { showPaymentError('연락처를 입력해주세요.'); return null; }
    if (!email || !EMAIL_RE.test(email)) { showPaymentError('올바른 이메일 주소를 입력해주세요.'); return null; }
    if (!address) { showPaymentError('배송지 주소를 입력해주세요.'); return null; }
    return { name: name, phone: phone, email: email, address: address, website: website };
  }

  /** Posts the order to the GAS admin backend so staff can see it under 주문 관리. */
  function submitOrder(info, items, paymentMethod) {
    var endpoint = window.VELORA_CHECKOUT_ENDPOINT;
    if (!endpoint || endpoint.indexOf('REPLACE_WITH') !== -1) {
      return Promise.reject(new Error('결제 확정 기능이 아직 준비 중입니다. 인스타그램 DM으로 문의해주세요.'));
    }
    var payload = {
      action: 'submitOrder',
      customerName: info.name,
      customerPhone: info.phone,
      customerEmail: info.email,
      shippingAddress: info.address,
      paymentMethod: paymentMethod,
      // productId/link disambiguate same-named products in the admin later —
      // without them, staff has no way to tell which of two identically
      // named products a given order line actually refers to.
      items: items.map(function (it) { return { productId: it.id, name: it.name, price: it.price, qty: it.qty, image: it.image, link: it.link }; }),
      website: info.website,
    };
    return fetch(endpoint, {
      method: 'POST',
      // text/plain keeps this a CORS "simple request" — GAS doPost can't handle
      // a preflight OPTIONS request, so application/json would fail here.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data || data.ok !== true) throw new Error((data && data.error) || '주문 접수에 실패했습니다.');
        return data;
      })
      .catch(function (e) {
        if (e instanceof TypeError) throw new Error('네트워크 오류로 주문 접수에 실패했습니다. 다시 시도해주세요.');
        throw e;
      });
  }

  function showCheckoutSuccessPopup() {
    var overlay = document.getElementById('checkoutSuccessOverlay');
    var popup;
    if (!overlay) {
      var css = '#checkoutSuccessOverlay{position:fixed;inset:0;z-index:10000;background:rgba(13,13,13,0.5);' +
        'opacity:0;pointer-events:none;transition:opacity 1.4s ease-in-out;' +
        'display:flex;align-items:center;justify-content:center;padding:20px;}' +
        '#checkoutSuccessOverlay.is-visible{opacity:1;pointer-events:auto;}' +
        '#checkoutSuccessPopup{position:relative;background:#fff;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.22);' +
        'padding:36px 40px 32px;text-align:center;width:100%;max-width:380px;' +
        'opacity:0;transform:translateY(-80px);transition:opacity 1.1s ease-in-out,transform 1.1s ease-in-out;}' +
        '#checkoutSuccessOverlay.is-visible #checkoutSuccessPopup{opacity:1;transform:translateY(0);}' +
        '#checkoutSuccessPopup__close{position:absolute;top:12px;right:12px;padding:8px;color:var(--color-muted);opacity:0.55;transition:opacity 0.15s;}' +
        '#checkoutSuccessPopup__close:hover{opacity:1;}' +
        '#checkoutSuccessPopup__icon{width:60px;height:60px;border-radius:50%;background:#1a7a3c;' +
        'display:flex;align-items:center;justify-content:center;margin:0 auto 18px;}' +
        '.checkout-success-popup__title{font-family:var(--font-heading);font-size:20px;font-weight:600;margin-bottom:8px;color:var(--color-text);}' +
        '.checkout-success-popup__sub{font-size:13.5px;color:var(--color-muted);line-height:1.6;}' +
        '@media (max-width:480px){#checkoutSuccessPopup{padding:30px 24px 26px;}}';
      var style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);

      overlay = document.createElement('div');
      overlay.id = 'checkoutSuccessOverlay';
      popup = document.createElement('div');
      popup.id = 'checkoutSuccessPopup';
      popup.innerHTML =
        '<button type="button" id="checkoutSuccessPopup__close" aria-label="닫기">' +
          '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
        '</button>' +
        '<div id="checkoutSuccessPopup__icon">' +
          '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>' +
        '</div>' +
        '<p class="checkout-success-popup__title">결제가 완료되었습니다!</p>' +
        '<p class="checkout-success-popup__sub">소중한 주문 진심으로 감사합니다.<br>확인 후 인스타그램 DM으로 안내드릴게요.</p>';
      overlay.appendChild(popup);
      document.body.appendChild(overlay);

      var hide = function () { overlay.classList.remove('is-visible'); };
      popup.querySelector('#checkoutSuccessPopup__close').addEventListener('click', hide);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) hide();
      });
    }

    overlay.classList.add('is-visible');
    clearTimeout(overlay._autoHideTimer);
    overlay._autoHideTimer = setTimeout(function () {
      overlay.classList.remove('is-visible');
    }, 7000);
  }

  function showCheckoutSuccess() {
    renderCartPage();
    showCheckoutSuccessPopup();
  }

  function initPaymentChoiceToggle() {
    var radios = document.querySelectorAll('input[name="cartPaymentChoice"]');
    if (!radios.length) return;
    var panels = document.querySelectorAll('[data-payment-panel]');
    var sync = function () {
      var selected = document.querySelector('input[name="cartPaymentChoice"]:checked');
      var value = selected ? selected.value : '';
      panels.forEach(function (panel) {
        panel.hidden = panel.getAttribute('data-payment-panel') !== value;
      });
      showPaymentError('');
    };
    radios.forEach(function (radio) { radio.addEventListener('change', sync); });
    sync();
  }

  function initInstaClearCartLink() {
    var link = document.getElementById('clearCartInstaLink');
    if (!link) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      if (!getCart().length) return;
      saveCart([]);
      updateBadges();
      renderCartPage();
      showToast('장바구니가 삭제되었습니다');
    });
  }

  function initPaymentActions() {
    initPaymentChoiceToggle();
    initInstaClearCartLink();

    var copyBtn = document.getElementById('copyAccountBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var accountNumber = document.getElementById('bankAccountNumber');
        var text = accountNumber ? accountNumber.textContent.trim() : '';
        if (!text) return;
        var done = function () { showToast('계좌번호가 복사되었습니다'); };
        var fail = function () { showPaymentError('계좌번호 복사에 실패했습니다. 직접 선택해 복사해주세요.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, fail);
        } else {
          fail();
        }
      });
    }

    var confirmBtn = document.getElementById('confirmBankTransferBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        var items = getCart();
        if (!items.length) return;
        showPaymentError('');
        var info = collectCheckoutInfo();
        if (!info) return;

        var originalLabel = confirmBtn.textContent;
        confirmBtn.disabled = true;
        confirmBtn.textContent = '처리 중...';
        submitOrder(info, items, '계좌이체')
          .then(function () {
            saveCart([]);
            updateBadges();
            showCheckoutSuccess();
          })
          .catch(function (e) {
            showPaymentError(e.message || '주문 접수에 실패했습니다. 잠시 후 다시 시도해주세요.');
          })
          .finally(function () {
            confirmBtn.disabled = false;
            confirmBtn.textContent = originalLabel;
          });
      });
    }
  }

  function flashAdded(btn) {
    var label = btn.querySelector('.product-info__add-to-cart-label') || btn;
    var original = label.getAttribute('data-original-label') || label.textContent;
    label.setAttribute('data-original-label', original);
    btn.classList.add('is-added');
    label.textContent = '담았습니다 ✓';
    clearTimeout(btn._cartFlashTimer);
    btn._cartFlashTimer = setTimeout(function () {
      btn.classList.remove('is-added');
      label.textContent = original;
    }, 1200);
  }

  function initAddButtons() {
    document.querySelectorAll('.pcard__cta, .product-info__add-to-cart, .sticky-buy-bar__cta').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var id, name, image, link, price;

        if (btn.hasAttribute('data-cart-id')) {
          id = btn.getAttribute('data-cart-id');
          name = btn.getAttribute('data-cart-name') || '';
          image = btn.getAttribute('data-cart-image') || '';
          link = btn.getAttribute('data-cart-link') || location.href;
          price = parsePrice(btn.getAttribute('data-cart-price'));
        } else {
          var card = btn.closest('.pcard, .product-card');
          var wishBtn = card && card.querySelector('[data-wish-id]');
          var priceEl = card && card.querySelector('.pcard__price, .product-card__price');
          if (!wishBtn) return;
          id = wishBtn.getAttribute('data-wish-id');
          name = wishBtn.getAttribute('data-wish-name') || '';
          image = wishBtn.getAttribute('data-wish-image') || '';
          link = wishBtn.getAttribute('data-wish-link') || '#';
          price = parsePrice(priceEl && priceEl.textContent);
        }

        if (!id) return;
        addItem(id, { name: name, image: image, link: link, price: price }, 1);
        showToast('장바구니에 담았습니다');
        if (btn.classList.contains('product-info__add-to-cart')) flashAdded(btn);
      });
    });
  }

  function renderCartPage() {
    var container = document.getElementById('cartItems');
    var summary = document.getElementById('cartSummary');
    var emptyState = document.querySelector('.cart-empty-state');
    if (!container) return;

    var items = getCart();
    if (!items.length) {
      container.style.display = 'none';
      if (summary) summary.style.display = 'none';
      if (emptyState) emptyState.style.display = '';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    container.style.display = '';
    if (summary) summary.style.display = '';

    container.innerHTML = items.map(function (it) {
      var lineTotal = it.price * it.qty;
      return (
        '<div class="cart-item" data-id="' + it.id + '">' +
          '<a href="' + (it.link || '#') + '" class="cart-item__media"><img src="' + it.image + '" alt="' + it.name + '" /></a>' +
          '<div class="cart-item__info">' +
            '<a href="' + (it.link || '#') + '" class="cart-item__name">' + it.name + '</a>' +
            '<div class="cart-item__qty">' +
              '<button type="button" class="cart-item__qty-btn" data-action="dec" aria-label="수량 감소">&minus;</button>' +
              '<span class="cart-item__qty-value">' + it.qty + '</span>' +
              '<button type="button" class="cart-item__qty-btn" data-action="inc" aria-label="수량 증가">+</button>' +
            '</div>' +
          '</div>' +
          '<div class="cart-item__price">₩' + lineTotal.toLocaleString() + '</div>' +
          '<button type="button" class="cart-item__remove" aria-label="삭제">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>' +
          '</button>' +
        '</div>'
      );
    }).join('');

    var total = items.reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);
    if (summary) {
      var totalEl = summary.querySelector('.cart-summary__total-value');
      if (totalEl) totalEl.textContent = '₩' + total.toLocaleString();
    }

    container.querySelectorAll('.cart-item').forEach(function (row) {
      var id = row.getAttribute('data-id');
      row.querySelector('[data-action="dec"]').addEventListener('click', function () {
        var it = getCart().find(function (x) { return x.id === id; });
        if (it) setQty(id, it.qty - 1);
      });
      row.querySelector('[data-action="inc"]').addEventListener('click', function () {
        var it = getCart().find(function (x) { return x.id === id; });
        if (it) setQty(id, it.qty + 1);
      });
      row.querySelector('.cart-item__remove').addEventListener('click', function () {
        removeItem(id);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initAddButtons();
    initPaymentActions();
    updateBadges();
    renderCartPage();
  });
})();
