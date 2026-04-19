(function(){
  if(window.__kritStorefixLoaded) return;
  window.__kritStorefixLoaded = true;
  var legacyOpenCheckout = typeof window.kritOpenCheckout === 'function' ? window.kritOpenCheckout : null;

  function getCart(){
    if(Array.isArray(window._cart)) return window._cart;
    try {
      window._cart = JSON.parse(localStorage.getItem('krit_cart') || '[]') || [];
    } catch(_error){
      window._cart = [];
    }
    return window._cart;
  }

  function getWishlist(){
    if(Array.isArray(window._wishlist)) return window._wishlist;
    try {
      window._wishlist = JSON.parse(localStorage.getItem('krit_wishlist') || '[]') || [];
    } catch(_error){
      window._wishlist = [];
    }
    return window._wishlist;
  }

  function saveCart(){
    try {
      localStorage.setItem('krit_cart', JSON.stringify(getCart()));
    } catch(_error){}
    if(typeof window.kritUpdateBadges === 'function'){
      try { window.kritUpdateBadges(); } catch(_error){}
    }
  }

  function saveWishlist(){
    try {
      localStorage.setItem('krit_wishlist', JSON.stringify(getWishlist()));
    } catch(_error){}
    if(typeof window.kritUpdateBadges === 'function'){
      try { window.kritUpdateBadges(); } catch(_error){}
    }
  }

  function toast(message){
    if(typeof window.kritToast === 'function'){
      try { return window.kritToast(message); } catch(_error){}
    }
    console.log(message);
  }

  function formatINR(value){
    if(typeof window.kritFormatINR === 'function'){
      try { return window.kritFormatINR(value); } catch(_error){}
    }
    return 'Rs ' + Number(value || 0).toLocaleString('en-IN');
  }

  function getProduct(productId){
    if(typeof window.kritGetProduct === 'function'){
      try { return window.kritGetProduct(productId); } catch(_error){}
    }
    if(!Array.isArray(window.KRIT_PRODUCTS)) return null;
    return window.KRIT_PRODUCTS.find(function(product){
      return product && product.id === productId;
    }) || null;
  }

  function getSelectedProduct(){
    if(typeof window._kritSelected !== 'number' || !Array.isArray(window.KRIT_PRODUCTS)) return null;
    return window.KRIT_PRODUCTS[window._kritSelected] || null;
  }

  function getCartItemImage(item){
    if(typeof window.kritGetCartItemImage === 'function'){
      try { return window.kritGetCartItemImage(item); } catch(_error){}
    }
    return '';
  }

  function ensureDrawer(){
    var overlay = document.getElementById('krit-storefix-drawer-overlay');
    if(overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'krit-storefix-drawer-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;display:none;align-items:stretch;justify-content:flex-end;background:rgba(3,8,18,.82);backdrop-filter:blur(8px);z-index:12000';
    overlay.innerHTML = ''
      + '<div id="krit-storefix-drawer" style="width:min(460px,100vw);height:100%;background:#0D1625;border-left:1px solid rgba(47,93,168,.18);box-shadow:-24px 0 60px rgba(0,0,0,.35);display:flex;flex-direction:column">'
      +   '<div style="display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid rgba(47,93,168,.14)">'
      +     '<h3 id="krit-storefix-drawer-title" style="margin:0;font-size:1rem;letter-spacing:.14em;text-transform:uppercase;color:#F0F4FF">KRIT</h3>'
      +     '<button type="button" id="krit-storefix-drawer-close" style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.08);background:transparent;color:#A7BAD9;cursor:pointer">×</button>'
      +   '</div>'
      +   '<div id="krit-storefix-drawer-body" style="flex:1;overflow:auto;padding:18px 20px;color:#D8E4F8"></div>'
      + '</div>';
    overlay.addEventListener('click', function(event){
      if(event.target === overlay) closeDrawer();
    });
    overlay.querySelector('#krit-storefix-drawer-close').addEventListener('click', closeDrawer);
    document.body.appendChild(overlay);
    return overlay;
  }

  function openDrawer(title, body){
    var overlay = ensureDrawer();
    var titleEl = document.getElementById('krit-storefix-drawer-title');
    var bodyEl = document.getElementById('krit-storefix-drawer-body');
    if(titleEl) titleEl.textContent = title;
    if(bodyEl) bodyEl.innerHTML = body;
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer(){
    var overlay = document.getElementById('krit-storefix-drawer-overlay');
    if(overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  function addToCartFallback(name, price, qty, productId){
    var cart = getCart();
    var safeQty = Math.max(1, Number(qty || 1));
    var existing = cart.find(function(item){ return item && item.name === name; });
    if(existing){
      existing.qty = Math.max(1, Number(existing.qty || 0) + safeQty);
    } else {
      cart.push({ id: productId || '', name: name, price: Number(price || 0), qty: safeQty });
    }
    saveCart();
    toast(name + ' added to cart');
    return cart;
  }

  function addToWishlistFallback(name, price, productId){
    var wishlist = getWishlist();
    if(!wishlist.some(function(item){ return item && item.name === name; })){
      wishlist.push({ id: productId || '', name: name, price: Number(price || 0) });
      saveWishlist();
      toast('Saved to wishlist');
    } else {
      toast('Already in wishlist');
    }
    return wishlist;
  }

  function removeCartItem(name){
    window._cart = getCart().filter(function(item){ return item && item.name !== name; });
    saveCart();
    openCartSafe();
  }

  function updateCartItem(name, delta){
    window._cart = getCart().map(function(item){
      if(item && item.name === name){
        item.qty = Math.max(1, Number(item.qty || 1) + Number(delta || 0));
      }
      return item;
    });
    saveCart();
    openCartSafe();
  }

  function removeWishlistItem(name){
    window._wishlist = getWishlist().filter(function(item){ return item && item.name !== name; });
    saveWishlist();
    openWishlistSafe();
  }

  function openCartSafe(){
    var cart = getCart();
    var subtotal = cart.reduce(function(sum, item){
      return sum + Number(item.qty || 0) * Number(item.price || 0);
    }, 0);
    var content = cart.length
      ? cart.map(function(item){
          var safeName = String(item.name || '').replace(/'/g, "\\'");
          var itemImage = getCartItemImage(item);
          return ''
            + '<div style="padding:14px 0;border-bottom:1px solid rgba(47,93,168,.1)">'
            +   '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">'
            +     '<div style="display:flex;gap:12px;align-items:flex-start;min-width:0">'
            +       (itemImage ? '<img src="' + itemImage + '" alt="' + String(item.name || '') + '" style="width:76px;height:76px;border-radius:14px;object-fit:cover;flex-shrink:0;border:1px solid rgba(47,93,168,.16);background:#06101d">' : '')
            +       '<div style="min-width:0">'
            +         '<div style="font-size:.92rem;color:#F0F4FF;font-weight:600;line-height:1.5">' + String(item.name || '') + '</div>'
            +         '<div style="font-size:.76rem;color:#8EA4C9;margin-top:4px">' + formatINR(item.price) + ' each</div>'
            +       '</div>'
            +     '</div>'
            +     '<button type="button" onclick="window.__kritStorefixRemoveCartItem(\'' + safeName + '\')" style="border:none;background:transparent;color:#8EA4C9;cursor:pointer">Remove</button>'
            +   '</div>'
            +   '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">'
            +     '<div style="display:flex;align-items:center;border:1px solid rgba(47,93,168,.18);border-radius:10px;overflow:hidden">'
            +       '<button type="button" onclick="window.__kritStorefixUpdateCartItem(\'' + safeName + '\',-1)" style="width:36px;height:36px;border:none;background:transparent;color:#F0F4FF;cursor:pointer">-</button>'
            +       '<span style="min-width:38px;text-align:center;color:#F0F4FF;font-weight:700">' + Number(item.qty || 0) + '</span>'
            +       '<button type="button" onclick="window.__kritStorefixUpdateCartItem(\'' + safeName + '\',1)" style="width:36px;height:36px;border:none;background:transparent;color:#F0F4FF;cursor:pointer">+</button>'
            +     '</div>'
            +     '<div style="font-family:\'Playfair Display\',serif;font-size:1.15rem;color:#F0F4FF;font-weight:700">' + formatINR(Number(item.qty || 0) * Number(item.price || 0)) + '</div>'
            +   '</div>'
            + '</div>';
        }).join('')
        + '<div style="padding-top:16px">'
        +   '<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#A9B8D4"><span>Subtotal</span><span>' + formatINR(subtotal) + '</span></div>'
        +   '<div style="display:flex;justify-content:space-between;margin-bottom:8px;color:#A9B8D4"><span>Shipping</span><span>Free</span></div>'
        +   '<div style="display:flex;justify-content:space-between;padding-top:12px;border-top:1px solid rgba(47,93,168,.12)"><span style="color:#F0F4FF;font-weight:700">Total</span><span style="font-family:\'Playfair Display\',serif;font-size:1.3rem;color:#F0F4FF;font-weight:700">' + formatINR(subtotal) + '</span></div>'
        +   '<button type="button" onclick="window.kritOpenCheckout(window._cart)" style="width:100%;margin-top:16px;padding:14px;border:none;border-radius:12px;background:#F9D548;color:#1B2340;font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Checkout</button>'
        +   '<button type="button" onclick="window.kritCloseDrawer()" style="width:100%;margin-top:10px;padding:13px;border:none;border-radius:12px;background:#2F5DA8;color:#fff;font-size:.76rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;cursor:pointer">Continue Shopping</button>'
        + '</div>'
      : '<div style="text-align:center;padding:32px 8px;color:#93A8CC">Your cart is empty.</div>';
    openDrawer('Your Cart', content);
  }

  function openWishlistSafe(){
    var wishlist = getWishlist();
    var content = wishlist.length
      ? wishlist.map(function(item){
          var safeName = String(item.name || '').replace(/'/g, "\\'");
          return ''
            + '<div style="padding:14px 0;border-bottom:1px solid rgba(47,93,168,.1);display:flex;justify-content:space-between;gap:12px;align-items:center">'
            +   '<div><div style="font-size:.92rem;color:#F0F4FF;font-weight:600;line-height:1.5">' + String(item.name || '') + '</div><div style="font-size:.78rem;color:#C9A84C;margin-top:4px">' + formatINR(item.price) + '</div></div>'
            +   '<div style="display:flex;gap:8px">'
            +     '<button type="button" onclick="window.addToCart(\'' + safeName + '\',' + Number(item.price || 0) + ',1,\'' + String(item.id || '').replace(/'/g, "\\'") + '\');window.openWishlist();" style="padding:10px 12px;border:none;border-radius:10px;background:#2F5DA8;color:#fff;font-size:.72rem;font-weight:700;cursor:pointer">Add</button>'
            +     '<button type="button" onclick="window.__kritStorefixRemoveWishlistItem(\'' + safeName + '\')" style="padding:10px 12px;border:none;border-radius:10px;background:rgba(255,255,255,.06);color:#A9B8D4;font-size:.72rem;font-weight:700;cursor:pointer">Remove</button>'
            +   '</div>'
            + '</div>';
        }).join('')
      : '<div style="text-align:center;padding:32px 8px;color:#93A8CC">No saved items yet.</div>';
    openDrawer('Wishlist', content);
  }

  function openCheckoutSafe(items){
    var sourceItems = Array.isArray(items) && items.length ? items.slice() : getCart().slice();
    if(!sourceItems.length){
      toast('Add an item before checkout');
      return;
    }
    window._cart = sourceItems.map(function(item){
      return {
        id: item.id || '',
        name: item.name || 'KRIT Product',
        price: Number(item.price || 0),
        qty: Math.max(1, Number(item.qty || 1))
      };
    });
    saveCart();
    try {
      sessionStorage.setItem('krit_storefix_checkout', '1');
    } catch(_error){}
    if(location.pathname && /checkout\.html$/i.test(location.pathname)){
      if(typeof legacyOpenCheckout === 'function'){
        try { return legacyOpenCheckout(window._cart); } catch(_error){}
      }
      if(typeof window.__kritOpenCheckoutOriginal === 'function'){
        try { return window.__kritOpenCheckoutOriginal(window._cart); } catch(_error){}
      }
    }
    window.location.href = '/checkout.html';
  }

  function defineStoreFns(){
    window.addToCart = function(name, price, qty, productId){
      addToCartFallback(name, price, qty, productId);
      openCartSafe();
    };
    window.addToWishlist = function(name, price, productId){
      addToWishlistFallback(name, price, productId);
    };
    window.openCart = openCartSafe;
    window.openWishlist = openWishlistSafe;
    window.kritCloseDrawer = closeDrawer;
    window.kritQuickAdd = function(productId){
      var product = getProduct(productId);
      if(!product) return;
      window.addToCart(product.name + ' (' + product.subtitle + ')', product.price, 1, product.id);
    };
    window.kritQuickWishlist = function(productId){
      var product = getProduct(productId);
      if(!product) return;
      window.addToWishlist(product.name + ' (' + product.subtitle + ')', product.price, product.id);
    };
    window.kritDetailAddToCart = function(){
      var product = getSelectedProduct();
      if(!product) return;
      var qty = Math.max(1, Number(window._kritDetailQty || 1));
      window.addToCart(product.name + ' (' + product.subtitle + ')', product.price, qty, product.id);
    };
    window.kritDetailWishlist = function(){
      var product = getSelectedProduct();
      if(!product) return;
      window.addToWishlist(product.name + ' (' + product.subtitle + ')', product.price, product.id);
    };
    window.kritBuySingleNow = function(productId){
      var product = getProduct(productId);
      if(!product) return;
      openCheckoutSafe([{ id: product.id, name: product.name + ' (' + product.subtitle + ')', price: product.price, qty: 1 }]);
    };
    window.kritDetailBuyNow = function(){
      var product = getSelectedProduct();
      if(!product) return;
      var qty = Math.max(1, Number(window._kritDetailQty || 1));
      openCheckoutSafe([{ id: product.id, name: product.name + ' (' + product.subtitle + ')', price: product.price, qty: qty }]);
    };
    window.kritOpenCheckout = openCheckoutSafe;
    window.__kritStorefixRemoveCartItem = removeCartItem;
    window.__kritStorefixUpdateCartItem = updateCartItem;
    window.__kritStorefixRemoveWishlistItem = removeWishlistItem;
  }

  function handleAction(node){
    if(!node) return false;
    var action = node.getAttribute('data-krit-action') || '';
    var productId = node.getAttribute('data-krit-product') || '';
    var id = node.id || '';
    var onclick = String(node.getAttribute('onclick') || '');
    var text = String((node.textContent || '').trim()).toLowerCase();

    if(action === 'quick-cart' || onclick.indexOf('kritQuickAdd(') !== -1){
      window.kritQuickAdd(productId || ((onclick.match(/kritQuickAdd\('([^']+)'\)/) || [])[1] || ''));
      return true;
    }
    if(action === 'quick-buy' || onclick.indexOf('kritBuySingleNow(') !== -1){
      window.kritBuySingleNow(productId || ((onclick.match(/kritBuySingleNow\('([^']+)'\)/) || [])[1] || ''));
      return true;
    }
    if(action === 'quick-wishlist' || onclick.indexOf('kritQuickWishlist(') !== -1){
      window.kritQuickWishlist(productId || ((onclick.match(/kritQuickWishlist\('([^']+)'\)/) || [])[1] || ''));
      return true;
    }
    if(id === 'krit-detail-cart-btn' || onclick.indexOf('kritDetailAddToCart(') !== -1 || text === 'add to cart'){
      window.kritDetailAddToCart();
      return true;
    }
    if(id === 'krit-detail-buy-btn' || onclick.indexOf('kritDetailBuyNow(') !== -1 || text === 'buy now'){
      window.kritDetailBuyNow();
      return true;
    }
    if(id === 'detail-wishlist-btn' || onclick.indexOf('kritDetailWishlist(') !== -1 || text.indexOf('wishlist') !== -1){
      window.kritDetailWishlist();
      return true;
    }
    if(id === 'krit-shop-cart-btn' || id === 'krit-sidebar-cart-btn' || onclick.indexOf('openCart(') !== -1 || text === 'cart' || text === 'checkout'){
      window.openCart();
      return true;
    }
    if(id === 'krit-shop-wishlist-btn' || onclick.indexOf('openWishlist(') !== -1){
      window.openWishlist();
      return true;
    }
    return false;
  }

  function bind(){
    defineStoreFns();
    document.addEventListener('click', function(event){
      var node = event.target && event.target.closest ? event.target.closest('button,[data-krit-action]') : null;
      if(!node) return;
      if(!handleAction(node)) return;
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }, true);

    if(location.pathname && /checkout\.html$/i.test(location.pathname)){
      setTimeout(function(){
        var shouldLaunch = false;
        try {
          shouldLaunch = sessionStorage.getItem('krit_storefix_checkout') === '1';
        } catch(_error){}
        if(!shouldLaunch) return;
        try { sessionStorage.removeItem('krit_storefix_checkout'); } catch(_error){}
        if(getCart().length){
          openCheckoutSafe(getCart());
        }
      }, 350);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
