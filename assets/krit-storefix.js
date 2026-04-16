(function(){
  if(window.__kritStorefixLoaded) return;
  window.__kritStorefixLoaded = true;

  function getCart(){
    if(Array.isArray(window._cart)) return window._cart;
    try {
      window._cart = JSON.parse(localStorage.getItem('krit_cart') || '[]') || [];
    } catch(_error) {
      window._cart = [];
    }
    return window._cart;
  }

  function getWishlist(){
    if(Array.isArray(window._wishlist)) return window._wishlist;
    try {
      window._wishlist = JSON.parse(localStorage.getItem('krit_wishlist') || '[]') || [];
    } catch(_error) {
      window._wishlist = [];
    }
    return window._wishlist;
  }

  function saveCart(){
    if(typeof window.kritSaveCart === 'function'){
      return window.kritSaveCart();
    }
    try {
      localStorage.setItem('krit_cart', JSON.stringify(getCart()));
    } catch(_error){}
    if(typeof window.kritUpdateBadges === 'function') window.kritUpdateBadges();
  }

  function saveWishlist(){
    if(typeof window.kritSaveWishlist === 'function'){
      return window.kritSaveWishlist();
    }
    try {
      localStorage.setItem('krit_wishlist', JSON.stringify(getWishlist()));
    } catch(_error){}
    if(typeof window.kritUpdateBadges === 'function') window.kritUpdateBadges();
  }

  function toast(message){
    if(typeof window.kritToast === 'function'){
      return window.kritToast(message);
    }
    console.log(message);
  }

  function getProduct(productId){
    if(typeof window.kritGetProduct === 'function'){
      return window.kritGetProduct(productId);
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

  function openCartSafe(){
    if(typeof window.openCart === 'function'){
      try {
        return window.openCart();
      } catch(_error){}
    }
    toast('Cart updated');
  }

  function openWishlistSafe(){
    if(typeof window.openWishlist === 'function'){
      try {
        return window.openWishlist();
      } catch(_error){}
    }
    toast('Wishlist updated');
  }

  function openCheckoutSafe(items){
    if(typeof window.kritOpenCheckout === 'function'){
      return window.kritOpenCheckout(items);
    }
    toast('Checkout is not available right now');
  }

  function ensureStoreFns(){
    if(typeof window.kritQuickAdd !== 'function'){
      window.kritQuickAdd = function(productId){
        var product = getProduct(productId);
        if(!product) return;
        addToCartFallback(product.name + ' (' + product.subtitle + ')', product.price, 1, product.id);
        openCartSafe();
      };
    }

    if(typeof window.kritQuickWishlist !== 'function'){
      window.kritQuickWishlist = function(productId){
        var product = getProduct(productId);
        if(!product) return;
        addToWishlistFallback(product.name + ' (' + product.subtitle + ')', product.price, product.id);
      };
    }

    if(typeof window.kritDetailAddToCart !== 'function'){
      window.kritDetailAddToCart = function(){
        var product = getSelectedProduct();
        if(!product) return;
        var qty = Math.max(1, Number(window._kritDetailQty || 1));
        addToCartFallback(product.name + ' (' + product.subtitle + ')', product.price, qty, product.id);
        openCartSafe();
      };
    }

    if(typeof window.kritDetailWishlist !== 'function'){
      window.kritDetailWishlist = function(){
        var product = getSelectedProduct();
        if(!product) return;
        addToWishlistFallback(product.name + ' (' + product.subtitle + ')', product.price, product.id);
      };
    }

    if(typeof window.kritBuySingleNow !== 'function'){
      window.kritBuySingleNow = function(productId){
        var product = getProduct(productId);
        if(!product) return;
        openCheckoutSafe([{ id: product.id, name: product.name + ' (' + product.subtitle + ')', price: product.price, qty: 1 }]);
      };
    }

    if(typeof window.kritDetailBuyNow !== 'function'){
      window.kritDetailBuyNow = function(){
        var product = getSelectedProduct();
        if(!product) return;
        var qty = Math.max(1, Number(window._kritDetailQty || 1));
        openCheckoutSafe([{ id: product.id, name: product.name + ' (' + product.subtitle + ')', price: product.price, qty: qty }]);
      };
    }
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
      openCartSafe();
      return true;
    }
    if(id === 'krit-shop-wishlist-btn' || onclick.indexOf('openWishlist(') !== -1){
      openWishlistSafe();
      return true;
    }
    return false;
  }

  function bind(){
    ensureStoreFns();
    document.addEventListener('click', function(event){
      var node = event.target && event.target.closest ? event.target.closest('button,[data-krit-action]') : null;
      if(!node) return;
      if(!handleAction(node)) return;
      event.preventDefault();
      event.stopPropagation();
      if(typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    }, true);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
