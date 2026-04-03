(function(){
  var page = (document.body && document.body.getAttribute('data-krit-page')) || 'index';
  var pageMap = {
    index: './index.html',
    product: './product.html',
    account: './account.html',
    checkout: './checkout.html'
  };

  function onReady(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function qs(selector, root){
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function setHref(selector, href){
    qs(selector).forEach(function(node){
      if(node && node.tagName === 'A') node.setAttribute('href', href);
    });
  }

  function addRouteStyles(){
    if(document.getElementById('krit-page-mode-style')) return;
    var style = document.createElement('style');
    style.id = 'krit-page-mode-style';
    style.textContent = ''
      + 'body.krit-page-product .hero,'
      + 'body.krit-page-product #about,'
      + 'body.krit-page-product #testi,'
      + 'body.krit-page-product #blog{display:none !important;}'
      + 'body.krit-page-product #buy{padding-top:140px !important;}'
      + 'body.krit-page-account .hero,'
      + 'body.krit-page-account #buy,'
      + 'body.krit-page-account #about,'
      + 'body.krit-page-account #testi,'
      + 'body.krit-page-account #blog{display:none !important;}'
      + 'body.krit-page-account .faq-tab{display:none !important;}'
      + 'body.krit-page-account #krit-auth-overlay{position:relative !important; inset:auto !important; display:flex !important; background:transparent !important; min-height:calc(100vh - 180px); padding:56px 20px 32px; align-items:center; justify-content:center;}'
      + 'body.krit-page-account #krit-auth-overlay .krit-auth-close{display:flex !important;}'
      + 'body.krit-page-account #krit-auth-overlay .krit-auth-card{max-width:720px; width:min(100%,720px); box-shadow:0 32px 80px rgba(0,0,0,.35);}'
      + 'body.krit-page-checkout .hero,'
      + 'body.krit-page-checkout #about,'
      + 'body.krit-page-checkout #testi,'
      + 'body.krit-page-checkout #blog{display:none !important;}'
      + 'body.krit-page-checkout #buy{padding-top:140px !important;}'
      + 'body.krit-page-checkout .faq-tab{display:none !important;}'
      + 'body.krit-page-checkout .krit-checkout-launch{max-width:1180px;margin:130px auto 0;padding:0 24px 24px;}'
      + 'body.krit-page-checkout .krit-checkout-launch-card{background:rgba(8,18,33,.96);border:1px solid rgba(79,136,234,.15);border-radius:24px;padding:28px 28px 24px;box-shadow:0 22px 70px rgba(0,0,0,.28);display:flex;gap:18px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;}'
      + 'body.krit-page-checkout .krit-checkout-launch-copy{max-width:580px;}'
      + 'body.krit-page-checkout .krit-checkout-launch-copy h2{margin:0 0 8px;font-family:"Playfair Display",serif;font-size:2rem;color:#fff;}'
      + 'body.krit-page-checkout .krit-checkout-launch-copy p{margin:0;color:#9fb5d9;line-height:1.8;}'
      + 'body.krit-page-checkout .krit-checkout-launch-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}'
      + 'body.krit-page-checkout .krit-checkout-launch-actions button, body.krit-page-checkout .krit-checkout-launch-actions a{height:52px;padding:0 22px;border-radius:16px;border:1px solid rgba(79,136,234,.22);background:rgba(255,255,255,.04);color:#eef4ff;font:700 .78rem/1 "DM Sans",sans-serif;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;}'
      + 'body.krit-page-checkout .krit-checkout-launch-actions .primary{background:linear-gradient(135deg,#f9d548,#eecb34);color:#1b2340;border:none;box-shadow:0 20px 40px rgba(249,213,72,.18);}'
      + '@media (max-width:860px){body.krit-page-product #buy,body.krit-page-checkout #buy{padding-top:108px !important;}body.krit-page-account #krit-auth-overlay{min-height:calc(100vh - 120px);padding-top:26px;}body.krit-page-checkout .krit-checkout-launch{margin-top:102px;padding:0 16px 18px;}body.krit-page-checkout .krit-checkout-launch-card{padding:22px 18px 18px;border-radius:20px;}body.krit-page-checkout .krit-checkout-launch-copy h2{font-size:1.55rem;}}';
    document.head.appendChild(style);
  }

  function rewritePrimaryNav(){
    setHref('.nl', pageMap.index);
    setHref('.nls a[href="#buy"]', pageMap.product);
    setHref('.nls a[href="#about"]', pageMap.index + '#about');
    setHref('.nls a[href="#testi"]', pageMap.index + '#testi');
    setHref('.nls a[href="#blog"]', pageMap.index + '#blog');
    setHref('#drw a[href="#buy"]', pageMap.product);
    setHref('#drw a[href="#about"]', pageMap.index + '#about');
    setHref('#drw a[href="#our-story"]', pageMap.index + '#our-story');
    setHref('#drw a[href="#testi"]', pageMap.index + '#testi');
    setHref('#drw a[href="#blog"]', pageMap.index + '#blog');
  }

  function rewriteFooterLinks(){
    setHref('footer a[href="#buy"]', pageMap.product);
    setHref('footer a[href="#about"]', pageMap.index + '#about');
    setHref('footer a[href="#testi"]', pageMap.index + '#testi');
    setHref('footer a[href="#blog"]', pageMap.index + '#blog');
  }

  function rewriteActionButtons(){
    qs('.nav-account-btn').forEach(function(btn){
      if(page === 'index') return;
      btn.onclick = function(event){
        if(event) event.preventDefault();
        if(page === 'account'){
          var overlay = document.getElementById('krit-auth-overlay');
          if(overlay) overlay.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return false;
        }
        window.location.href = pageMap.account;
        return false;
      };
    });
    qs('#drw button[onclick*="openAuthModal"]').forEach(function(btn){
      if(page === 'index') return;
      btn.onclick = function(event){
        if(event) event.preventDefault();
        if(window.closeDrw) closeDrw();
        if(page === 'account'){
          var overlay = document.getElementById('krit-auth-overlay');
          if(overlay) overlay.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return false;
        }
        window.location.href = pageMap.account;
        return false;
      };
    });
    qs('a[href="#buy"].nav-shop-btn').forEach(function(btn){
      btn.setAttribute('href', pageMap.product);
    });
  }

  function enhanceCheckoutPage(){
    if(page !== 'checkout') return;
    document.body.classList.add('krit-page-checkout');
    var buy = document.getElementById('buy');
    if(!buy) return;
    if(!document.querySelector('.krit-checkout-launch')){
      var wrap = document.createElement('section');
      wrap.className = 'krit-checkout-launch';
      wrap.innerHTML = ''
        + '<div class="krit-checkout-launch-card">'
        +   '<div class="krit-checkout-launch-copy">'
        +     '<h2>Secure KRIT checkout</h2>'
        +     '<p>Review your cart, complete your details, and place your order with a smoother app-like checkout flow. If your cart is still empty, you can continue shopping first.</p>'
        +   '</div>'
        +   '<div class="krit-checkout-launch-actions">'
        +     '<button type="button" class="primary" id="krit-open-checkout-page-btn">Open Checkout</button>'
        +     '<a href="./product.html">Continue Shopping</a>'
        +   '</div>'
        + '</div>';
      buy.parentNode.insertBefore(wrap, buy);
      document.getElementById('krit-open-checkout-page-btn').addEventListener('click', function(){
        if(typeof window.kritOpenCheckout === 'function'){
          if(Array.isArray(window._kritCart) && window._kritCart.length){
            window.kritOpenCheckout();
          } else if(typeof window.openCart === 'function'){
            window.openCart();
          }
        }
      });
    }
    setTimeout(function(){
      if(Array.isArray(window._kritCart) && window._kritCart.length && typeof window.kritOpenCheckout === 'function'){
        window.kritOpenCheckout();
      }
    }, 350);
  }

  function enhanceAccountPage(){
    if(page !== 'account') return;
    window.location.replace('./index.html?view=account');
  }

  function enhanceProductPage(){
    if(page !== 'product') return;
    document.body.classList.add('krit-page-product');
    setTimeout(function(){
      var buy = document.getElementById('buy');
      if(buy) buy.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 120);
  }

  function enhanceIndexPage(){
    if(page !== 'index') return;
    document.body.classList.add('krit-page-index');
    try {
      var params = new URLSearchParams(window.location.search || '');
      if(params.get('view') === 'account'){
        setTimeout(function(){
          if(typeof window.openAuthModal === 'function') window.openAuthModal();
          try {
            window.history.replaceState(null, '', './index.html');
          } catch(e){}
        }, 120);
      }
    } catch(e){}
  }

  onReady(function(){
    addRouteStyles();
    rewritePrimaryNav();
    rewriteFooterLinks();
    rewriteActionButtons();
    enhanceIndexPage();
    enhanceProductPage();
    enhanceAccountPage();
    enhanceCheckoutPage();
  });
})();

