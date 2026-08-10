/* Populates the static product-detail template from window.VELORA_PRODUCTS
   based on the ?item= query param. Must run before script.js (which sets up
   the related-products carousel from whatever is already in #productsTrack). */
(function () {
  var products = window.VELORA_PRODUCTS || [];
  if (!products.length) return;

  var COLLECTION = {
    jewelry: { label: '주얼리', link: '/jewelry/' },
    watch: { label: '시계', link: '/watch/' },
  };

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function money(n) {
    return '₩' + Number(n).toLocaleString();
  }

  function sanitizeHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    tmp.querySelectorAll('script, style').forEach(function (el) { el.remove(); });
    tmp.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (attr) {
        if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      });
    });
    return tmp.innerHTML;
  }

  function thumbHtml(src, alt, active) {
    return '<button class="product-gallery__thumb' + (active ? ' product-gallery__thumb--active' : '') + '">' +
      '<img' + (active ? '' : ' loading="lazy"') + ' src="' + src + '" alt="' + alt + '" /></button>';
  }

  function pcardHtml(p) {
    var img = p.images[0] || '';
    return (
      '<div class="pcard">' +
        '<div class="pcard__media">' +
          '<button class="pcard__wish" aria-label="위시리스트 추가" data-wish-id="' + p.id + '" data-wish-name="' + p.name + '" data-wish-image="' + img + '" data-wish-link="/product/?item=' + p.id + '">' +
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>' +
          '</button>' +
          '<a href="/product/?item=' + p.id + '"><img loading="lazy" src="' + img + '" alt="' + p.name + '" /></a>' +
          '<span class="pcard__badge">정품 · 프리러브드</span>' +
        '</div>' +
        '<div class="pcard__info">' +
          '<p class="pcard__name">' + p.name + '</p>' +
          '<p class="pcard__price">' + money(p.price) + '</p>' +
          '<a href="/product/?item=' + p.id + '" class="pcard__cta">장바구니 담기</a>' +
        '</div>' +
      '</div>'
    );
  }

  function pickRelated(product) {
    var related = products.filter(function (p) { return p.category === product.category && p.id !== product.id; });
    if (related.length <= 8) return related;
    var picks = [];
    var step = Math.max(1, Math.floor(related.length / 8));
    for (var i = 0; i < related.length && picks.length < 8; i += step) picks.push(related[i]);
    return picks;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function render() {
    var id = getParam('item');
    var product = products.find(function (p) { return p.id === id; }) || products[0];
    var collection = COLLECTION[product.category] || COLLECTION.jewelry;

    document.title = product.name + ' — Velora Jewelry';
    setText('pageTitle', document.title);

    var crumbCollection = document.getElementById('breadcrumbCollection');
    if (crumbCollection) {
      crumbCollection.textContent = collection.label;
      crumbCollection.setAttribute('href', collection.link);
    }
    setText('breadcrumbProduct', product.name);

    var thumbsWrap = document.getElementById('productGalleryThumbs');
    if (thumbsWrap) {
      thumbsWrap.innerHTML = product.images.map(function (src, i) {
        return thumbHtml(src, product.name, i === 0);
      }).join('');
    }
    var mainImg = document.getElementById('productMainImg');
    if (mainImg) {
      mainImg.src = product.images[0] || '';
      mainImg.alt = product.name;
    }

    setText('productTitle', product.name);
    setText('productPrice', money(product.price));

    var addBtn = document.getElementById('addToCartBtn');
    if (addBtn) {
      addBtn.setAttribute('data-cart-id', product.id);
      addBtn.setAttribute('data-cart-name', product.name);
      addBtn.setAttribute('data-cart-image', product.images[0] || '');
      addBtn.setAttribute('data-cart-price', product.price);
    }

    var otherLink = document.getElementById('otherOptionsLink');
    if (otherLink) otherLink.setAttribute('href', collection.link);

    var descNode = document.getElementById('productDescriptionContent');
    if (descNode) descNode.innerHTML = sanitizeHtml(product.description) || ('<p>' + product.name + '</p>');

    setText('stickyBuyBarName', product.name);
    setText('stickyBuyBarPrice', money(product.price));
    var stickyCta = document.getElementById('stickyBuyBarCta');
    if (stickyCta) {
      stickyCta.setAttribute('data-cart-id', product.id);
      stickyCta.setAttribute('data-cart-name', product.name);
      stickyCta.setAttribute('data-cart-image', product.images[0] || '');
      stickyCta.setAttribute('data-cart-price', product.price);
    }

    var track = document.getElementById('productsTrack');
    if (track) track.innerHTML = pickRelated(product).map(pcardHtml).join('');
  }

  render();
})();
