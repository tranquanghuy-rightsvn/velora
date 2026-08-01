/* Client-side wishlist: no backend, persisted in localStorage */
(function () {
  var STORAGE_KEY = 'velora_wishlist';

  function getWishlist() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveWishlist(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function updateBadges() {
    var count = getWishlist().length;
    document.querySelectorAll('.icon-badge').forEach(function (el) {
      el.textContent = count;
      el.style.display = count > 0 ? '' : '';
    });
  }

  function toggleItem(id, meta) {
    var items = getWishlist();
    var idx = items.findIndex(function (it) { return it.id === id; });
    if (idx > -1) {
      items.splice(idx, 1);
    } else {
      items.push(Object.assign({ id: id }, meta));
    }
    saveWishlist(items);
    updateBadges();
    return idx === -1; // true = just added
  }

  function isSaved(id) {
    return getWishlist().some(function (it) { return it.id === id; });
  }

  function initButtons() {
    document.querySelectorAll('.pcard__wish[data-wish-id]').forEach(function (btn) {
      var id = btn.getAttribute('data-wish-id');
      if (isSaved(id)) btn.classList.add('pcard__wish--active');

      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var meta = {
          name: btn.getAttribute('data-wish-name') || '',
          image: btn.getAttribute('data-wish-image') || '',
          link: btn.getAttribute('data-wish-link') || '#',
        };
        var added = toggleItem(id, meta);
        btn.classList.toggle('pcard__wish--active', added);
        btn.classList.add('pcard__wish--pop');
        setTimeout(function () { btn.classList.remove('pcard__wish--pop'); }, 260);
      });
    });
  }

  function renderWishlistPage() {
    var grid = document.getElementById('wishlistGrid');
    var emptyState = document.querySelector('.wishlist-empty');
    if (!grid) return;

    var items = getWishlist();
    if (!items.length) {
      grid.style.display = 'none';
      if (emptyState) emptyState.style.display = '';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = items.map(function (it) {
      return (
        '<div class="product-card">' +
          '<div class="product-card__media">' +
            '<button class="pcard__wish pcard__wish--active" data-wish-id="' + it.id + '" aria-label="위시리스트 제거"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg></button>' +
            '<a href="' + it.link + '"><img src="' + it.image + '" alt="' + it.name + '" /></a>' +
          '</div>' +
          '<div class="product-card__info">' +
            '<a href="' + it.link + '" class="product-card__name">' + it.name + '</a>' +
            '<p class="product-card__price">가격 문의 (DM)</p>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    initButtons();
  }

  document.addEventListener('DOMContentLoaded', function () {
    initButtons();
    updateBadges();
    renderWishlistPage();
  });
})();
