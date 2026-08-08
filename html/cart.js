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

  function getCartTotal() {
    return getCart().reduce(function (sum, it) { return sum + it.price * it.qty; }, 0);
  }

  var paypalRendered = false;

  function showPaypalError(msg) {
    var errEl = document.getElementById('paypalError');
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = msg ? '' : 'none';
  }

  function showCheckoutSuccess(orderId) {
    var items = document.getElementById('cartItems');
    var summary = document.getElementById('cartSummary');
    var success = document.getElementById('cartSuccessState');
    if (items) items.style.display = 'none';
    if (summary) summary.style.display = 'none';
    if (success) {
      success.style.display = '';
      var orderEl = document.getElementById('cartSuccessOrderId');
      if (orderEl) orderEl.textContent = orderId ? ('주문 번호: ' + orderId) : '';
    }
  }

  function renderPaypalButton() {
    var container = document.getElementById('paypalButtonContainer');
    if (!container || paypalRendered) return;
    if (typeof paypal === 'undefined' || !paypal.Buttons) {
      showPaypalError('PayPal 결제 모듈을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    paypalRendered = true;

    // KRW is a zero-decimal currency for PayPal: amount must be a whole number.
    paypal.Buttons({
      style: { layout: 'vertical', color: 'black', shape: 'rect', label: 'pay' },
      createOrder: function (data, actions) {
        showPaypalError('');
        var value = String(Math.max(1, Math.round(getCartTotal())));
        return actions.order.create({
          purchase_units: [{ amount: { currency_code: 'KRW', value: value } }]
        });
      },
      onApprove: function (data, actions) {
        return actions.order.capture().then(function (details) {
          saveCart([]);
          updateBadges();
          showCheckoutSuccess(details.id);
        });
      },
      onCancel: function () {
        showPaypalError('결제가 취소되었습니다.');
      },
      onError: function (err) {
        console.error('PayPal error:', err);
        showPaypalError('결제 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }).render('#paypalButtonContainer');
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
    renderPaypalButton();

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
    updateBadges();
    renderCartPage();
  });
})();
