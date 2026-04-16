(function(){
  var CONFIG = window.KRIT_ECOMMERCE || {
    siteUrl: 'https://kritsleep.in',
    instagramUrl: 'https://www.instagram.com/kritsleep',
    facebookPageUrl: 'https://www.facebook.com/',
    facebookPixelId: '',
    firebase: {
      apiKey: '',
      authDomain: '',
      projectId: '',
      storageBucket: '',
      messagingSenderId: '',
      appId: '',
      measurementId: ''
    }
  };

  var firebaseReadyPromise = null;
  var lightboxThumbsEl = null;
  var authObserverBound = false;
  var visitLogPromise = null;
  var phoneConfirmationResult = null;
  var phoneRecaptchaVerifier = null;
  var pendingCheckoutItems = null;

  function loadScript(src){
    return new Promise(function(resolve, reject){
      var existing = document.querySelector('script[src="' + src + '"]');
      if(existing){
        if(existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', function(){ resolve(); }, {once:true});
        existing.addEventListener('error', reject, {once:true});
        return;
      }
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function(){ script.dataset.loaded = 'true'; resolve(); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function track(eventName, params){
    try {
      if(window.gtag) window.gtag('event', eventName, params || {});
    } catch(e){}
  }

  function getCurrentProduct(){
    if(typeof window._kritSelected !== 'number' || window._kritSelected < 0 || !window.KRIT_PRODUCTS) return null;
    return window.KRIT_PRODUCTS[window._kritSelected] || null;
  }

  function productShareUrl(product){
    var base = CONFIG.siteUrl || location.href.split('?')[0].split('#')[0];
    return base + '?product=' + encodeURIComponent(product.id) + '#buy';
  }

  function syncProductMeta(product){
    if(!product) return;
    var title = 'KRIT ' + product.name + ' | Natural Latex Pillow';
    var desc = product.desc || 'Shop KRIT natural latex pillows.';
    document.title = title;
    ['og:title','twitter:title'].forEach(function(name){
      var el = document.querySelector('meta[property="' + name + '"]') || document.querySelector('meta[name="' + name + '"]');
      if(el) el.setAttribute('content', title);
    });
    ['description','og:description','twitter:description'].forEach(function(name){
      var el = document.querySelector('meta[name="' + name + '"]') || document.querySelector('meta[property="' + name + '"]');
      if(el) el.setAttribute('content', desc);
    });
    var imageMeta = document.querySelector('meta[property="og:image"]');
    if(imageMeta && product.images && product.images[0]) imageMeta.setAttribute('content', product.images[0]);
    try {
      history.replaceState(null, '', '#product=' + product.id);
    } catch(e){}
  }

  function authMessage(text, type){
    var box = document.getElementById('krit-auth-message');
    if(!box) return;
    box.className = 'krit-msg show ' + (type || 'info');
    box.textContent = text;
  }

  function clearAuthMessage(){
    var box = document.getElementById('krit-auth-message');
    if(!box) return;
    box.className = 'krit-msg';
    box.textContent = '';
  }

  async function ensureFirebase(){
    if(firebaseReadyPromise) return firebaseReadyPromise;
    var cfg = CONFIG.firebase || {};
    if(!cfg.apiKey || !cfg.projectId){
      return Promise.resolve(null);
    }
    firebaseReadyPromise = (async function(){
      await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
      if(!window.firebase) return null;
      if(!firebase.apps.length){
        firebase.initializeApp(cfg);
      }
      return firebase;
    })().catch(function(){ return null; });
    return firebaseReadyPromise;
  }

  function makeSafeKey(value, fallback){
    return String(value || fallback || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function escapeHtml(value){
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getVisitSessionId(){
    try {
      var existing = sessionStorage.getItem('krit_visit_session_id');
      if(existing) return existing;
      var fresh = 'visit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('krit_visit_session_id', fresh);
      return fresh;
    } catch(e){
      return 'visit_' + Date.now();
    }
  }

  async function logVisit(){
    if(visitLogPromise) return visitLogPromise;
    visitLogPromise = (async function(){
      var fb = await ensureFirebase();
      if(!fb || !fb.firestore) return false;
      var pageKey = location.pathname.replace(/[^a-zA-Z0-9]/g, '_') || 'home';
      var sessionId = getVisitSessionId();
      var onceKey = 'krit_visit_logged_' + pageKey + '_' + sessionId;
      try {
        if(sessionStorage.getItem(onceKey)) return true;
      } catch(e){}
      try {
        await fb.firestore().collection('visits').add({
          sessionId: sessionId,
          path: location.pathname || '/',
          href: location.href,
          title: document.title || 'KRIT',
          referrer: document.referrer || '',
          userAgent: navigator.userAgent || '',
          accountEmail: (window._kritAccount && window._kritAccount.email) || '',
          accountUid: (window._kritAccount && window._kritAccount.uid) || '',
          createdAt: fb.firestore.FieldValue.serverTimestamp()
        });
        try { sessionStorage.setItem(onceKey, '1'); } catch(e){}
        return true;
      } catch(e){
        return false;
      }
    })();
    return visitLogPromise;
  }

  async function bindFirebaseAuthState(){
    if(authObserverBound) return;
    var fb = await ensureFirebase();
    if(!fb || !fb.auth) return;
    authObserverBound = true;
    fb.auth().onAuthStateChanged(async function(user){
      if(!user) return;
      var fallbackProfile = window._kritAccount || {};
      var profile = {
        uid: user.uid || '',
        name: user.displayName || fallbackProfile.name || 'KRIT Customer',
        email: (user.email || fallbackProfile.email || '').toLowerCase(),
        phone: fallbackProfile.phone || (user.phoneNumber ? String(user.phoneNumber).replace(/^\+91/, '') : ''),
        avatar: user.photoURL || fallbackProfile.avatar || '',
        provider: (user.providerData && user.providerData[0] && user.providerData[0].providerId) || fallbackProfile.provider || 'firebase',
        createdAt: fallbackProfile.createdAt || new Date().toISOString()
      };
      if(typeof window.kritPersistAccount === 'function') window.kritPersistAccount(profile);
      await saveCustomerProfile(profile, 'firebase-auth-state');
      updateAuthUI();
      logVisit();
    });
  }

  function continuePendingCheckout(){
    if(!pendingCheckoutItems || !Array.isArray(pendingCheckoutItems) || !pendingCheckoutItems.length) return;
    if(typeof window.__kritOpenCheckoutOriginal === 'function'){
      var items = pendingCheckoutItems.slice();
      pendingCheckoutItems = null;
      setTimeout(function(){ window.__kritOpenCheckoutOriginal(items); }, 150);
    }
  }

  function getStoredCartItems(){
    try {
      return JSON.parse(localStorage.getItem('krit_cart') || '[]') || [];
    } catch(e){
      return [];
    }
  }

  function getStoredWishlistItems(){
    try {
      return JSON.parse(localStorage.getItem('krit_wishlist') || '[]') || [];
    } catch(e){
      return [];
    }
  }

  function fallbackSaveCart(items){
    try {
      localStorage.setItem('krit_cart', JSON.stringify(items));
    } catch(e){}
    window._cart = items;
    if(typeof window.kritUpdateBadges === 'function') window.kritUpdateBadges();
  }

  function fallbackSaveWishlist(items){
    try {
      localStorage.setItem('krit_wishlist', JSON.stringify(items));
    } catch(e){}
    window._wishlist = items;
    if(typeof window.kritUpdateBadges === 'function') window.kritUpdateBadges();
  }

  function safeAddToCart(name, price, qty, productId){
    if(typeof window.addToCart === 'function'){
      try {
        return window.addToCart(name, price, qty, productId);
      } catch(err){
        console.warn('Primary addToCart failed, using fallback cart logic.', err);
      }
    }
    var items = Array.isArray(window._cart) ? window._cart.slice() : getStoredCartItems();
    qty = Math.max(1, Number(qty || 1));
    var existing = items.find(function(item){ return item.name === name; });
    if(existing){
      existing.qty += qty;
    } else {
      items.push({ id: productId || '', name: name, price: Number(price || 0), qty: qty });
    }
    fallbackSaveCart(items);
    if(typeof window.kritToast === 'function') window.kritToast(name + ' added to cart');
    if(typeof window.openCart === 'function'){
      setTimeout(function(){ window.openCart(); }, 120);
    }
  }

  function safeAddToWishlist(name, price, productId){
    if(typeof window.addToWishlist === 'function'){
      try {
        return window.addToWishlist(name, price, productId);
      } catch(err){
        console.warn('Primary addToWishlist failed, using fallback wishlist logic.', err);
      }
    }
    var items = Array.isArray(window._wishlist) ? window._wishlist.slice() : getStoredWishlistItems();
    if(!items.some(function(item){ return item.name === name; })){
      items.push({ id: productId || '', name: name, price: Number(price || 0) });
      fallbackSaveWishlist(items);
      if(typeof window.kritToast === 'function') window.kritToast('Saved to wishlist');
    } else if(typeof window.kritToast === 'function'){
      window.kritToast('Already in wishlist');
    }
  }

  function safeOpenWishlist(){
    if(typeof window.openWishlist === 'function' && !window.openWishlist.__kritFallback){
      return window.openWishlist();
    }
    var items = Array.isArray(window._wishlist) ? window._wishlist : getStoredWishlistItems();
    if(typeof window.kritOpenDrawer !== 'function') return;
    var content = items.length
      ? items.map(function(item){
          var safeName = String(item.name || '').replace(/'/g, "\\'");
          return ''
            + '<div style="padding:14px 0;border-bottom:1px solid rgba(47,93,168,.1);display:flex;justify-content:space-between;gap:12px;align-items:center">'
            +   '<div><div style="font-size:.92rem;color:#F0F4FF;font-weight:600;line-height:1.5">' + escapeHtml(item.name) + '</div><div style="font-size:.78rem;color:#C9A84C;margin-top:4px">Rs ' + Number(item.price || 0).toLocaleString('en-IN') + '</div></div>'
            +   '<div style="display:flex;gap:8px">'
            +     '<button type="button" onclick="window.__kritSafeAddWishlistItemToCart(\'' + safeName + '\',' + Number(item.price || 0) + ',\'' + escapeHtml(item.id || '') + '\')" style="padding:10px 12px;border:none;border-radius:10px;background:#2F5DA8;color:#fff;font-size:.72rem;font-weight:700;cursor:pointer">Add</button>'
            +   '</div>'
            + '</div>';
        }).join('')
      : '<div style="text-align:center;padding:32px 8px;color:#93A8CC">No saved items yet.</div>';
    window.kritOpenDrawer('Wishlist', content);
  }

  function safeOpenCheckout(items){
    if(typeof window.kritOpenCheckout === 'function'){
      try {
        return window.kritOpenCheckout(items);
      } catch(err){
        console.warn('Primary checkout launch failed, using original checkout fallback.', err);
      }
    }
    if(typeof window.__kritOpenCheckoutOriginal === 'function'){
      return window.__kritOpenCheckoutOriginal(items);
    }
    if(typeof window.kritToast === 'function') window.kritToast('Checkout could not be opened right now. Please refresh once and try again.');
  }

  function patchStoreActions(){
    window.__kritSafeAddWishlistItemToCart = function(name, price, productId){
      safeAddToCart(name, price, 1, productId);
      safeOpenWishlist();
    };

    window.kritQuickAdd = function(productId){
      if(typeof window.kritGetProduct !== 'function') return;
      var product = window.kritGetProduct(productId);
      if(!product) return;
      safeAddToCart(product.name + ' (' + product.subtitle + ')', product.price, 1, product.id);
    };

    window.kritDetailAddToCart = function(){
      if(typeof window._kritSelected !== 'number' || window._kritSelected < 0 || !window.KRIT_PRODUCTS) return;
      var product = window.KRIT_PRODUCTS[window._kritSelected];
      var qty = Math.max(1, Number(window._kritDetailQty || 1));
      safeAddToCart(product.name + ' (' + product.subtitle + ')', product.price, qty, product.id);
    };

    window.kritDetailWishlist = function(){
      if(typeof window._kritSelected !== 'number' || window._kritSelected < 0 || !window.KRIT_PRODUCTS) return;
      var product = window.KRIT_PRODUCTS[window._kritSelected];
      safeAddToWishlist(product.name + ' (' + product.subtitle + ')', product.price, product.id);
    };

    window.kritBuySingleNow = function(productId){
      if(typeof window.kritGetProduct !== 'function') return;
      var product = window.kritGetProduct(productId);
      if(!product) return;
      safeOpenCheckout([{ id: product.id, name: product.name + ' (' + product.subtitle + ')', price: product.price, qty: 1 }]);
    };

    window.kritDetailBuyNow = function(){
      if(typeof window._kritSelected !== 'number' || window._kritSelected < 0 || !window.KRIT_PRODUCTS) return;
      var product = window.KRIT_PRODUCTS[window._kritSelected];
      var qty = Math.max(1, Number(window._kritDetailQty || 1));
      safeOpenCheckout([{ id: product.id, name: product.name + ' (' + product.subtitle + ')', price: product.price, qty: qty }]);
    };

    if(typeof window.openWishlist !== 'function' || !window.openWishlist.__kritFallback){
      var originalWishlist = typeof window.openWishlist === 'function' ? window.openWishlist : null;
      window.openWishlist = function(){
        if(originalWishlist){
          try {
            return originalWishlist.apply(this, arguments);
          } catch(err){
            console.warn('Wishlist drawer fallback used.', err);
          }
        }
        return safeOpenWishlist();
      };
      window.openWishlist.__kritFallback = true;
    }
  }

  async function ensurePhoneRecaptcha(fb){
    if(phoneRecaptchaVerifier) return phoneRecaptchaVerifier;
    var holder = document.getElementById('krit-phone-recaptcha');
    if(!holder){
      holder = document.createElement('div');
      holder.id = 'krit-phone-recaptcha';
      holder.style.position = 'absolute';
      holder.style.left = '-9999px';
      holder.style.width = '1px';
      holder.style.height = '1px';
      document.body.appendChild(holder);
    }
    phoneRecaptchaVerifier = new fb.auth.RecaptchaVerifier('krit-phone-recaptcha', {
      size: 'invisible'
    });
    try { await phoneRecaptchaVerifier.render(); } catch(e){}
    return phoneRecaptchaVerifier;
  }

  function firebaseAuthErrorMessage(error, flow){
    var code = (error && error.code) || '';
    var host = window.location && window.location.hostname ? window.location.hostname : 'this domain';
    if(code === 'auth/unauthorized-domain'){
      return 'Firebase has not authorized ' + host + ' yet. Add it in Firebase Authentication > Settings > Authorized domains.';
    }
    if(code === 'auth/popup-blocked'){
      return 'Google sign-in popup was blocked by the browser. Allow popups and try again.';
    }
    if(code === 'auth/popup-closed-by-user'){
      return 'Google sign-in was closed before it finished. Please try again.';
    }
    if(code === 'auth/operation-not-allowed'){
      return flow === 'otp'
        ? 'Phone OTP sign-in is not enabled in Firebase yet.'
        : 'This sign-in method is not enabled in Firebase yet.';
    }
    if(code === 'auth/captcha-check-failed'){
      return 'OTP verification could not start. Refresh the page and try again.';
    }
    if(code === 'auth/invalid-phone-number'){
      return 'Please enter a valid 10-digit mobile number.';
    }
    if(code === 'auth/quota-exceeded' || code === 'auth/too-many-requests'){
      return flow === 'otp'
        ? 'Firebase SMS quota is currently exhausted. Please use email or Google login for now.'
        : 'Too many attempts were made. Please wait a moment and try again.';
    }
    if(code === 'auth/invalid-app-credential'){
      return 'OTP could not be started from this domain yet. Please use kritsleep.in after adding it in Firebase authorized domains.';
    }
    if(code === 'auth/account-exists-with-different-credential'){
      return 'This email is already linked with another sign-in method. Try logging in with that method first.';
    }
    return flow === 'otp'
      ? 'OTP could not be sent right now. Please try again in a moment.'
      : 'Sign-in could not be completed right now. Please try again in a moment.';
  }

  async function sendOtpLogin(){
    clearAuthMessage();
    var phoneEl = document.getElementById('auth-otp-phone');
    var phone = phoneEl ? phoneEl.value.replace(/\D/g,'').trim() : '';
    if(typeof window.kritValidPhone === 'function' && !window.kritValidPhone(phone)){
      authMessage('Please enter a valid 10-digit mobile number for OTP login.', 'err');
      return;
    }
    var fb = await ensureFirebase();
    if(!fb || !fb.auth){
      authMessage('Phone OTP login is not available right now. Please use Google or email instead.', 'err');
      return;
    }
    try {
      authMessage('Sending OTP to your mobile...', 'info');
      var verifier = await ensurePhoneRecaptcha(fb);
      phoneConfirmationResult = await fb.auth().signInWithPhoneNumber('+91' + phone, verifier);
      var wrap = document.getElementById('krit-otp-verify-wrap');
      var codeEl = document.getElementById('krit-otp-code');
      if(wrap) wrap.style.display = 'grid';
      if(codeEl) codeEl.focus();
      track('login', { method: 'phone_otp_requested' });
      authMessage('OTP sent successfully. Enter the code to continue.', 'ok');
    } catch(error) {
      phoneConfirmationResult = null;
      authMessage(firebaseAuthErrorMessage(error, 'otp'), 'err');
    }
  }

  async function verifyOtpLogin(){
    clearAuthMessage();
    var codeEl = document.getElementById('krit-otp-code');
    var phoneEl = document.getElementById('auth-otp-phone');
    var nameEl = document.getElementById('auth-name');
    var code = codeEl ? codeEl.value.replace(/\D/g,'').trim() : '';
    var phone = phoneEl ? phoneEl.value.replace(/\D/g,'').trim() : '';
    if(!phoneConfirmationResult){
      authMessage('Please request an OTP first.', 'err');
      return;
    }
    if(code.length < 6){
      authMessage('Please enter the 6-digit OTP.', 'err');
      return;
    }
    try {
      var result = await phoneConfirmationResult.confirm(code);
      var user = result.user || {};
      var stored = null;
      try { stored = JSON.parse(localStorage.getItem('krit_account_profile') || 'null'); } catch(e) { stored = null; }
      var profile = {
        uid: user.uid || '',
        name: (nameEl && nameEl.value.trim()) || (stored && stored.name) || 'KRIT Customer',
        email: (stored && stored.phone === phone && stored.email) || '',
        phone: phone,
        avatar: user.photoURL || '',
        provider: 'phone',
        createdAt: (stored && stored.phone === phone && stored.createdAt) || new Date().toISOString()
      };
      if(typeof window.kritPersistAccount === 'function') window.kritPersistAccount(profile);
      await saveCustomerProfile(profile, 'phone-otp');
      updateAuthUI();
      track('login', { method: 'phone_otp' });
      authMessage('Phone verified successfully.', 'ok');
      if(window.kritToast) window.kritToast('Mobile login complete');
      if(typeof window.closeAuthModal === 'function') window.closeAuthModal();
      continuePendingCheckout();
    } catch(error) {
      authMessage('The OTP was invalid or expired. Please request a new code.', 'err');
    }
  }

  async function syncCustomerToERP(profile, source){
    if(!profile || (!profile.email && !profile.phone)) return false;
    try {
      var response = await fetch('/api/erp/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name || 'KRIT Customer',
          phone: profile.phone || '',
          email: profile.email || '',
          city: profile.city || '',
          state: profile.state || '',
          pincode: profile.pincode || '',
          address: profile.address || '',
          source: source || 'website',
          provider: profile.provider || 'email',
          notes: 'Website account sync'
        })
      });
      return response.ok;
    } catch(e) {
      return false;
    }
  }

  async function saveCustomerProfile(profile, source){
    if(!profile || (!profile.email && !profile.phone)) return false;
    localStorage.setItem('krit_customer_last_source', source || 'website');
    var cached = [];
    try { cached = JSON.parse(localStorage.getItem('krit_customer_profiles') || '[]'); } catch(e) { cached = []; }
    var existingIndex = cached.findIndex(function(item){
      return (!!profile.email && item.email === profile.email) || (!!profile.phone && item.phone && item.phone === profile.phone);
    });
    var merged = Object.assign({}, existingIndex >= 0 ? cached[existingIndex] : {}, profile, { source: source || 'website', updatedAt: new Date().toISOString() });
    if(existingIndex >= 0) cached[existingIndex] = merged; else cached.unshift(merged);
    localStorage.setItem('krit_customer_profiles', JSON.stringify(cached.slice(0,50)));

    var firebaseSaved = false;
    var fb = await ensureFirebase();
    if(fb && fb.firestore){
      try {
        var key = makeSafeKey(profile.uid || profile.phone || profile.email, 'guest');
        await fb.firestore().collection('customers').doc(key).set({
          uid: profile.uid || '',
          name: profile.name || '',
          email: profile.email || '',
          phone: profile.phone || '',
          avatar: profile.avatar || '',
          source: source || 'website',
          provider: profile.provider || 'email',
          lastLoginAt: fb.firestore.FieldValue.serverTimestamp(),
          updatedAt: fb.firestore.FieldValue.serverTimestamp(),
          createdAt: profile.createdAt || fb.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        firebaseSaved = true;
      } catch(e) {}
    }

    var erpSaved = await syncCustomerToERP(merged, source);
    if(erpSaved){
      merged.erpSyncState = 'synced';
      merged.erpSyncAt = new Date().toISOString();
      localStorage.setItem('krit_customer_profiles', JSON.stringify(cached.slice(0,50)));
    }
    return firebaseSaved || erpSaved;
  }

  function getStoredOrders(){
    if(Array.isArray(window._kritOrders)) return window._kritOrders;
    try {
      return JSON.parse(localStorage.getItem('krit_orders') || '[]') || [];
    } catch(e){
      return [];
    }
  }

  function getCustomerOrderMeta(order){
    if(window.kritOrderStatusMeta) return window.kritOrderStatusMeta(order && order.status);
    var status = (order && order.status) || 'placed';
    var lookup = {
      new: { label: 'Order placed', tone: 'new' },
      placed: { label: 'Order placed', tone: 'new' },
      confirmed: { label: 'Confirmed', tone: 'confirmed' },
      processing: { label: 'Processing', tone: 'confirmed' },
      packed: { label: 'Packed', tone: 'shipped' },
      shipped: { label: 'Shipped', tone: 'shipped' },
      delivered: { label: 'Delivered', tone: 'delivered' },
      cancelled: { label: 'Cancelled', tone: 'cancelled' },
      payment_pending: { label: 'Payment pending', tone: 'pending' }
    };
    return lookup[status] || { label: status, tone: 'new' };
  }

  function getCustomerOrders(account, sourceOrders){
    var orders = sourceOrders || getStoredOrders();
    if(!account || (!account.email && !account.phone)) return [];
    var email = (account.email || '').toLowerCase();
    var phone = String(account.phone || '').replace(/\D/g, '');
    return orders.filter(function(order){
      var customer = order && order.customer ? order.customer : {};
      var orderEmail = String(customer.email || '').toLowerCase();
      var orderPhone = String(customer.phone || '').replace(/\D/g, '');
      return (!!email && orderEmail === email) || (!!phone && orderPhone === phone);
    }).sort(function(a, b){
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }

  function normalizeErpOrder(order){
    if(!order) return null;
    var paymentMode = String(order.payment_mode || '').trim() || 'Website';
    var paymentStatus = String(order.payment_status || '').trim().toLowerCase() || 'pending';
    var status = String(order.status || '').trim().toLowerCase() || 'new';
    var createdAt = order.created_at ? String(order.created_at).replace(' ', 'T') : (order.date || new Date().toISOString());
    return {
      id: order.id,
      status: status,
      total: Number(order.total || 0),
      subtotal: Number(order.subtotal || 0),
      tax: Number(order.tax || 0),
      discount: Number(order.discount || 0),
      shippingCharge: Number(order.shipping_charge || 0),
      createdAt: createdAt,
      createdLabel: createdAt ? new Date(createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : (order.date || 'Recently'),
      paymentMode: paymentMode,
      paymentLabel: paymentMode,
      paymentState: paymentStatus === 'paid' ? 'paid' : 'pending',
      trackingNumber: order.awb || '',
      courier: order.courier || '',
      trackingUrl: order.tracking_url || '',
      items: Array.isArray(order.items) ? order.items.map(function(item){
        return {
          id: item.product_id || item.sku || '',
          sku: item.sku || '',
          name: item.description || 'KRIT Pillow',
          qty: Number(item.qty || 1),
          price: Number(item.rate || 0),
          amount: Number(item.amount || 0)
        };
      }) : [],
      customer: {
        name: order.customer_name || 'KRIT Customer',
        phone: order.customer_phone || '',
        email: order.customer_email || '',
        address: order.customer_address || '',
        city: order.customer_city || '',
        pincode: order.customer_pincode || ''
      },
      erpSource: true
    };
  }

  async function fetchCustomerOrdersFromERP(account){
    if(!account || (!account.email && !account.phone)) return [];
    var response = await fetch('/api/erp/customer-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: account.email || '',
        phone: account.phone || ''
      })
    });
    var text = await response.text();
    var body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch(_error) {
      body = { raw: text };
    }
    if(!response.ok){
      throw new Error((body && body.error) || ('ERP orders request failed with status ' + response.status));
    }
    return Array.isArray(body.orders) ? body.orders.map(normalizeErpOrder).filter(Boolean) : [];
  }

  function mergeCustomerOrders(account, erpOrders){
    var map = {};
    getCustomerOrders(account).forEach(function(order){
      if(order && order.id) map[order.id] = order;
    });
    (erpOrders || []).forEach(function(order){
      if(!order || !order.id) return;
      map[order.id] = Object.assign({}, map[order.id] || {}, order);
    });
    return Object.keys(map).map(function(id){ return map[id]; }).sort(function(a, b){
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });
  }

  function getRecentAddress(accountOrders){
    var orderWithAddress = (accountOrders || []).find(function(order){
      return order && order.customer && (order.customer.address || order.customer.city || order.customer.pincode);
    });
    if(!orderWithAddress || !orderWithAddress.customer) return 'Add your delivery address during checkout.';
    return [
      orderWithAddress.customer.address,
      orderWithAddress.customer.city,
      orderWithAddress.customer.pincode
    ].filter(Boolean).join(', ');
  }

  function mergeTransientOrders(orderList){
    var orders = Array.isArray(orderList) ? orderList.slice() : [];
    function pushIfMissing(entry, prioritize){
      if(!entry || !entry.id) return;
      var normalized = normalizeErpOrder(entry) || entry;
      var exists = orders.some(function(existing){
        return existing && String(existing.id) === String(normalized.id);
      });
      if(exists) return;
      if(prioritize){
        orders.unshift(normalized);
      } else {
        orders.push(normalized);
      }
    }
    var storedOrders = getStoredOrders();
    if(Array.isArray(storedOrders) && storedOrders.length){
      storedOrders.forEach(function(entry){ pushIfMissing(entry, false); });
    }
    if(window._kritLastConfirmedOrder){
      pushIfMissing(window._kritLastConfirmedOrder, true);
    }
    return orders.sort(function(a, b){
      return new Date((b && b.createdAt) || 0).getTime() - new Date((a && a.createdAt) || 0).getTime();
    });
  }

  function openAccountOrderTracker(orderId){
    if(!orderId) return;
    var orders = Array.isArray(window._kritAccountOrders) ? window._kritAccountOrders.slice() : [];
    var storedOrders = getStoredOrders();
    if(Array.isArray(storedOrders) && storedOrders.length){
      storedOrders.forEach(function(entry){
        if(entry && entry.id && !orders.some(function(existing){ return existing && String(existing.id) === String(entry.id); })){
          orders.push(entry);
        }
      });
    }
    if(window._kritLastConfirmedOrder && window._kritLastConfirmedOrder.id && !orders.some(function(existing){ return existing && String(existing.id) === String(window._kritLastConfirmedOrder.id); })){
      orders.unshift(window._kritLastConfirmedOrder);
    }
    var order = orders.find(function(entry){
      return entry && String(entry.id) === String(orderId);
    });
    if(!order){
      if(window.kritToast) window.kritToast('Order details are still loading. Please try again in a moment.');
      return;
    }
    openAccountOrderDetails(order);
  }

  async function openTrackModal(){
    var hasAccount = !!(window._kritAccount && (window._kritAccount.email || window._kritAccount.phone));
    var orders = mergeTransientOrders(Array.isArray(window._kritAccountOrders) ? window._kritAccountOrders.slice() : []);
    window._kritAccountOrders = orders;

    if(hasAccount){
      try{
        if(typeof window.openAuthModal === 'function') window.openAuthModal();
        await renderAccountDashboard();
        switchAccountPanel('orders');
        if(!orders.length){
          if(window.kritToast) window.kritToast('No orders are available in your account yet.');
          return;
        }
        setTimeout(function(){
          openAccountOrderTracker(orders[0].id);
        }, 120);
        return;
      }catch(trackErr){
        console.warn('Track modal account flow failed, using fallback overlay.', trackErr);
      }
    }

    var legacyTrackOverlay = document.getElementById('track-overlay');
    if(legacyTrackOverlay){
      legacyTrackOverlay.classList.add('open');
      document.body.style.overflow = 'hidden';
      var trackInput = document.getElementById('track-awb');
      if(trackInput) setTimeout(function(){ trackInput.focus(); }, 60);
      return;
    }

    if(orders.length){
      openAccountOrderTracker(orders[0].id);
      return;
    }

    if(window.kritToast) window.kritToast('No recent orders are available yet. Place an order first.');
  }

  function buildOrderTrackingTimeline(order){
    var timeline = Array.isArray(order.timeline) && order.timeline.length ? order.timeline.slice() : [];
    if(!timeline.length){
      timeline = [
        {
          status: 'placed',
          note: 'Order received on the KRIT website.',
          time: order.createdAt || order.createdLabel || 'Recently'
        }
      ];
      if(order.status && order.status !== 'placed'){
        timeline.push({
          status: order.status,
          note: 'Latest order status updated in KRIT OMS.',
          time: order.updatedAt || order.createdAt || order.createdLabel || 'Recently'
        });
      }
    }
    return timeline;
  }

  function closeAccountOrderDetails(){
    var existing = document.getElementById('krit-account-order-overlay');
    if(!existing) return;
    if(existing._kritEscHandler){
      document.removeEventListener('keydown', existing._kritEscHandler);
    }
    existing.remove();
    var authOverlay = document.getElementById('krit-auth-overlay');
    if(!(authOverlay && authOverlay.classList.contains('open'))){
      document.body.style.overflow = '';
    }
  }

  function openAccountOrderShipment(orderId){
    var orders = Array.isArray(window._kritAccountOrders) ? window._kritAccountOrders : [];
    var order = orders.find(function(entry){
      return entry && String(entry.id) === String(orderId);
    });
    if(!order){
      if(window.kritToast) window.kritToast('Tracking details are not ready yet.');
      return;
    }
    if(order.trackingUrl){
      window.open(order.trackingUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if(order.trackingNumber){
      if(window.kritToast) window.kritToast('Tracking number: ' + order.trackingNumber);
      return;
    }
    openAccountOrderDetails(order);
    if(window.kritToast) window.kritToast('Tracking details will appear after your order is shipped.');
  }

  function openAccountOrderDetails(order){
    if(!order) return;
    closeAccountOrderDetails();
    var firstItem = order.items && order.items[0] ? order.items[0] : null;
    var statusMeta = getCustomerOrderMeta(order);
    var timeline = buildOrderTrackingTimeline(order);
    var overlay = document.createElement('div');
    overlay.id = 'krit-account-order-overlay';
    overlay.className = 'krit-account-order-overlay';
    overlay.onclick = function(event){
      if(event.target === overlay) closeAccountOrderDetails();
    };

    var timelineMarkup = timeline.map(function(step){
      var stepMeta = getCustomerOrderMeta({ status: step.status || 'placed', paymentState: order.paymentState });
      var toneClass = String(stepMeta.tone || 'new').replace(/[^a-z_]/g, '_');
      return [
        '<div class="krit-account-order-step status-' + toneClass + ' ' + (stepMeta.tone === statusMeta.tone ? 'active' : '') + '">',
          '<span class="krit-account-order-step-dot"></span>',
          '<div>',
            '<div class="krit-account-order-step-title">' + escapeHtml(stepMeta.label) + '</div>',
            '<div class="krit-account-order-step-note">' + escapeHtml(step.note || 'Status updated in KRIT') + '</div>',
          '</div>',
          '<div class="krit-account-order-step-time">' + escapeHtml(step.time || 'Recently') + '</div>',
        '</div>'
      ].join('');
    }).join('');

    overlay.innerHTML = [
      '<div class="krit-account-order-dialog">',
        '<div class="krit-account-order-dialog-head">',
          '<div>',
            '<div class="krit-account-order-id">' + escapeHtml(order.id) + '</div>',
            '<h3 class="krit-account-order-dialog-title">Track your KRIT order</h3>',
            '<p class="krit-account-order-dialog-copy">See payment state, shipment progress, delivery destination, and every update for this order in one place.</p>',
          '</div>',
          '<button type="button" class="krit-account-order-dialog-close" aria-label="Close order details">&times;</button>',
        '</div>',
        '<div class="krit-account-order-dialog-body">',
          '<div class="krit-account-order-dialog-grid">',
            '<div class="krit-account-order-dialog-card summary">',
              '<h4>Order summary</h4>',
              '<strong>' + escapeHtml(firstItem ? firstItem.name : 'KRIT Order') + '</strong>',
              '<p>' + escapeHtml((firstItem ? ((firstItem.qty || 1) + ' item' + ((firstItem.qty || 1) > 1 ? 's' : '')) : 'Order saved') + ' • ' + (order.createdLabel || (order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Recently')) + '') + '</p>',
              '<p>Total payable: <strong>' + escapeHtml('Rs ' + Number(order.total || 0).toLocaleString('en-IN')) + '</strong></p>',
              '<p>Payment mode: <strong>' + escapeHtml(order.paymentLabel || order.paymentMode || 'Website') + '</strong> • ' + escapeHtml(order.paymentState === 'paid' ? 'Paid' : (order.paymentState || 'Pending')) + '</p>',
            '</div>',
            '<div class="krit-account-order-dialog-card delivery">',
              '<h4>Delivery and tracking</h4>',
              '<strong>' + escapeHtml((order.customer && order.customer.city) || 'Saved delivery address') + '</strong>',
              '<p>' + escapeHtml(((order.customer && order.customer.address) || 'Address available in your checkout record')) + '</p>',
              '<p>' + escapeHtml(((order.customer && order.customer.pincode) ? ('PIN ' + order.customer.pincode) : 'Pincode will appear here')) + '</p>',
              '<p>Tracking: <strong>' + escapeHtml(order.trackingNumber || 'Will appear after shipping') + '</strong></p>',
              '<p>Courier: <strong>' + escapeHtml(order.courier || 'Courier will be assigned after shipment') + '</strong></p>',
            '</div>',
          '</div>',
          '<div class="krit-account-order-dialog-card timeline">',
            '<h4>Order timeline</h4>',
            '<div class="krit-account-order-timeline">' + timelineMarkup + '</div>',
          '</div>',
          '<div class="krit-account-order-dialog-actions">',
            '<button type="button" class="krit-btn krit-btn-primary" onclick="kritCloseAccountOrderDetails()">Done</button>',
            '<button type="button" class="krit-btn krit-btn-secondary" onclick="openAccountOrderShipment(\'' + String(order.id).replace(/'/g, "\\'") + '\')">Shipment details</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');

    var closeBtn = overlay.querySelector('.krit-account-order-dialog-close');
    if(closeBtn) closeBtn.onclick = closeAccountOrderDetails;
    overlay._kritEscHandler = function(event){
      if(event.key === 'Escape') closeAccountOrderDetails();
    };
    document.addEventListener('keydown', overlay._kritEscHandler);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
  }

  async function renderCustomerOrders(account){
    var list = document.getElementById('krit-account-orders-list');
    var countNode = document.getElementById('krit-account-order-count');
    var pendingNode = document.getElementById('krit-account-pending-count');
    var spentNode = document.getElementById('krit-account-total-spent');
    var addressNode = document.getElementById('krit-account-address');
    if(list){
      list.innerHTML = [
        '<div class="krit-account-empty">',
          '<div class="krit-account-empty-title">Loading your orders</div>',
          '<div class="krit-account-empty-copy">We are pulling your latest payment, shipping, and delivery status from KRIT.</div>',
        '</div>'
      ].join('');
    }
    var orders = [];
    try {
      var erpOrders = await fetchCustomerOrdersFromERP(account);
      orders = mergeTransientOrders(mergeCustomerOrders(account, erpOrders));
      window._kritAccountOrders = orders;
    } catch(error) {
      console.error('KRIT customer orders fetch failed', error);
      orders = mergeTransientOrders(mergeCustomerOrders(account, []));
      window._kritAccountOrders = orders;
    }
    if(countNode) countNode.textContent = String(orders.length);
    if(pendingNode){
      pendingNode.textContent = String(orders.filter(function(order){
        return ['payment_pending', 'new', 'placed', 'confirmed', 'processing', 'packed', 'shipped'].indexOf(order.status) >= 0;
      }).length);
    }
    if(spentNode){
      var totalSpent = orders.reduce(function(sum, order){
        return sum + Number(order.total || 0);
      }, 0);
      spentNode.textContent = totalSpent ? ('Rs ' + totalSpent.toLocaleString('en-IN')) : 'Rs 0';
    }
    if(addressNode) addressNode.textContent = getRecentAddress(orders);
    if(!list) return;
    if(!orders.length){
      list.innerHTML = [
        '<div class="krit-account-empty">',
          '<div class="krit-account-empty-title">No orders yet</div>',
          '<div class="krit-account-empty-copy">Once you place an order, payment status, shipment progress, and updates will appear here automatically.</div>',
        '</div>'
      ].join('');
      return;
    }
    list.innerHTML = orders.map(function(order){
      var meta = getCustomerOrderMeta(order);
      var firstItem = order.items && order.items[0] ? order.items[0] : null;
      var paymentText = order.paymentLabel || order.paymentMode || 'Website';
      var paymentState = order.paymentState === 'paid' ? 'Paid' : (order.paymentState === 'pending' ? 'Pending' : (order.paymentState || 'Pending'));
      var dateText = order.createdLabel || (order.createdAt ? new Date(order.createdAt).toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Recently');
      var statusCopy = {
        new: 'We have received your order and the KRIT team will confirm it shortly.',
        placed: 'We have received your order and the KRIT team will confirm it shortly.',
        confirmed: 'Your order is confirmed and being prepared for dispatch.',
        processing: 'Your order is being prepared in KRIT OMS.',
        packed: 'Your order is packed and ready for courier pickup.',
        shipped: 'Your shipment is on the move. Tracking details are available below.',
        delivered: 'Your order has been delivered successfully.',
        cancelled: 'This order has been cancelled.',
        payment_pending: 'Payment is pending. We will confirm the next step shortly.'
      };
      return [
        '<article class="krit-account-order-card">',
          '<div class="krit-account-order-top">',
            '<div>',
              '<div class="krit-account-order-id">' + order.id + '</div>',
              '<div class="krit-account-order-date">' + dateText + '</div>',
            '</div>',
            '<span class="krit-account-order-chip ' + meta.tone + '">' + meta.label + '</span>',
          '</div>',
          '<div class="krit-account-order-main">',
            '<div class="krit-account-order-item">',
              '<div class="krit-account-order-name">' + (firstItem ? firstItem.name : 'KRIT Order') + '</div>',
              '<div class="krit-account-order-sub">' + (firstItem ? ((firstItem.qty || 1) + ' item' + ((firstItem.qty || 1) > 1 ? 's' : '')) : 'Order details saved') + '</div>',
            '</div>',
            '<div class="krit-account-order-money">' + ('Rs ' + Number(order.total || 0).toLocaleString('en-IN')) + '</div>',
          '</div>',
          '<div class="krit-account-order-statusline"><div class="krit-account-order-statuscopy">' + (statusCopy[order.status] || 'Your latest order status is visible here.') + '</div></div>',
          '<div class="krit-account-order-grid">',
            '<div class="krit-account-order-meta"><span>Payment</span><strong>' + paymentText + '</strong><em>' + paymentState + '</em></div>',
            '<div class="krit-account-order-meta"><span>Tracking</span><strong>' + (order.trackingNumber || 'Will appear after shipping') + '</strong><em>' + ((order.courier || '').trim() || 'Courier will be assigned after shipment') + '</em></div>',
            '<div class="krit-account-order-meta"><span>Deliver to</span><strong>' + ((order.customer && order.customer.city) || 'Saved address') + '</strong><em>' + (((order.customer && order.customer.pincode) || '') ? ('PIN ' + order.customer.pincode) : 'Address available in checkout record') + '</em></div>',
          '</div>',
          '<div class="krit-account-order-actions">',
            '<button type="button" class="krit-btn krit-btn-primary" onclick="openAccountOrderTracker(\'' + String(order.id).replace(/'/g, "\\'") + '\')">Track order</button>',
            '<button type="button" class="krit-btn krit-btn-secondary" onclick="openAccountOrderShipment(\'' + String(order.id).replace(/'/g, "\\'") + '\')">Shipment details</button>',
          '</div>',
        '</article>'
      ].join('');
    }).join('');
  }

  function switchAccountPanel(panel){
    var target = panel || 'orders';
    var tabs = document.querySelectorAll('[data-krit-account-tab]');
    var panels = document.querySelectorAll('[data-krit-account-panel]');
    tabs.forEach(function(tab){
      var active = tab.getAttribute('data-krit-account-tab') === target;
      tab.classList.toggle('active', active);
    });
    panels.forEach(function(node){
      node.style.display = node.getAttribute('data-krit-account-panel') === target ? 'block' : 'none';
    });
  }

  async function renderAccountDashboard(){
    var account = window._kritAccount;
    var nameNode = document.getElementById('auth-account-name');
    var emailNode = document.getElementById('auth-account-email');
    var phoneNode = document.getElementById('auth-account-phone');
    var providerNode = document.getElementById('krit-account-provider');
    var greetingNode = document.getElementById('krit-account-greeting');
    var subtitleNode = document.getElementById('krit-account-subtitle');
    if(nameNode) nameNode.textContent = (account && account.name) || 'KRIT Customer';
    if(emailNode) emailNode.textContent = (account && account.email) || 'Email will appear here';
    if(phoneNode) phoneNode.textContent = (account && account.phone) ? ('+91 ' + account.phone) : 'Add your phone during checkout';
    if(providerNode) providerNode.textContent = account && account.provider ? String(account.provider).replace(/_/g, ' ') : 'customer account';
    if(greetingNode) greetingNode.textContent = 'Hello, ' + (((account && account.name) || 'KRIT Customer').split(' ')[0]);
    if(subtitleNode) subtitleNode.textContent = 'Track all your orders, payment states, delivery progress, and saved customer details in one place.';
    await renderCustomerOrders(account);
    switchAccountPanel('orders');
  }

  function premiumizeAuthMarkup(){
    var overlay = document.getElementById('krit-auth-overlay');
    var card = overlay && overlay.querySelector('.krit-auth-card');
    if(!card || card.dataset.kritPremium === 'true') return;
    card.dataset.kritPremium = 'true';
    card.classList.add('krit-auth-premium');
    var close = card.querySelector('.krit-auth-close');
    var logo = card.querySelector('.krit-auth-logo');
    var welcome = document.getElementById('auth-welcome');
    var formWrap = document.getElementById('krit-auth-form-wrap');
    var accountWrap = document.getElementById('krit-auth-account');
    if(!logo || !welcome || !formWrap || !accountWrap) return;

    var side = document.createElement('div');
    side.className = 'krit-auth-side';
    var main = document.createElement('div');
    main.className = 'krit-auth-main';
    var benefits = document.createElement('div');
    benefits.className = 'krit-auth-benefits';
    benefits.innerHTML = [
      '<div class="krit-auth-benefit"><strong>Faster checkout</strong>Save your delivery details and move through checkout in a few taps.</div>',
      '<div class="krit-auth-benefit"><strong>Order visibility</strong>Keep your purchases, payments, and tracking in one clean KRIT account.</div>',
      '<div class="krit-auth-benefit"><strong>Google and email login</strong>Use Google or your email and password, then sync the customer profile into KRIT.</div>'
    ].join('');

    side.appendChild(logo);
    side.appendChild(welcome);
    side.appendChild(benefits);

    var message = document.createElement('div');
    message.id = 'krit-auth-message';
    message.className = 'krit-msg';

    var form = document.getElementById('krit-auth-form');
    var submitBtn = document.getElementById('auth-email-btn');
    if(submitBtn){
      submitBtn.className = 'krit-btn krit-btn-primary';
    }

    if(form && !document.getElementById('krit-google-btn')){
      var googleBtn = document.createElement('button');
      googleBtn.type = 'button';
      googleBtn.id = 'krit-google-btn';
      googleBtn.className = 'krit-btn krit-btn-google';
      googleBtn.innerHTML = '<span class="krit-google-mark">G</span> Continue with Google';
      googleBtn.onclick = function(){ window.kritContinueWithGoogle && window.kritContinueWithGoogle(); };

      var divider = document.createElement('div');
      divider.className = 'krit-or';
      divider.innerHTML = '<span>or continue with email</span>';

      form.insertAdjacentElement('afterbegin', divider);
      form.insertAdjacentElement('afterbegin', googleBtn);
    }

    if(form && !document.getElementById('krit-otp-login-wrap')){
      var otpWrap = document.createElement('div');
      otpWrap.id = 'krit-otp-login-wrap';
      otpWrap.className = 'krit-auth-otp-wrap';
      otpWrap.innerHTML = [
        '<div class="krit-auth-otp-title">Mobile OTP login</div>',
        '<div class="krit-auth-otp-copy">Use just your mobile number to sign in and continue checkout.</div>',
        '<div class="krit-field"><label class="krit-label" for="auth-otp-phone">Mobile number</label><input class="krit-input" id="auth-otp-phone" type="tel" inputmode="numeric" maxlength="10" placeholder="Enter your 10-digit mobile number" autocomplete="tel-national"></div>',
        '<button type="button" id="krit-send-otp-btn" class="krit-btn krit-btn-otp">Send OTP</button>',
        '<div id="krit-otp-verify-wrap" style="display:none" class="krit-auth-otp-verify">',
          '<div class="krit-field"><label class="krit-label" for="krit-otp-code">OTP code</label><input class="krit-input" id="krit-otp-code" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP" autocomplete="one-time-code"></div>',
          '<button type="button" id="krit-verify-otp-btn" class="krit-btn krit-btn-primary">Verify OTP</button>',
        '</div>'
      ].join('');

      var dividerOtp = document.createElement('div');
      dividerOtp.className = 'krit-or';
      dividerOtp.innerHTML = '<span>or login with OTP</span>';

      var dividerEmail = document.createElement('div');
      dividerEmail.className = 'krit-or';
      dividerEmail.innerHTML = '<span>or continue with email</span>';

      var firstChild = form.firstChild;
      if(firstChild){
        form.insertBefore(dividerOtp, firstChild);
        form.insertBefore(otpWrap, dividerOtp.nextSibling);
        form.insertBefore(dividerEmail, otpWrap.nextSibling);
      } else {
        form.appendChild(dividerOtp);
        form.appendChild(otpWrap);
        form.appendChild(dividerEmail);
      }

      var otpBtn = otpWrap.querySelector('#krit-send-otp-btn');
      var verifyBtn = otpWrap.querySelector('#krit-verify-otp-btn');
      if(otpBtn) otpBtn.onclick = function(){ window.kritSendOtpLogin && window.kritSendOtpLogin(); };
      if(verifyBtn) verifyBtn.onclick = function(){ window.kritVerifyOtpLogin && window.kritVerifyOtpLogin(); };
    }

    if(form && !form.querySelector('.krit-auth-inline-note')){
      var note = document.createElement('div');
      note.className = 'krit-auth-inline-note';
      note.textContent = 'Use Google for one-tap sign-in, or create an email account with a secure password and add your mobile for checkout.';
      form.appendChild(note);
    }

    if(!accountWrap.querySelector('.krit-auth-account-card')){
      accountWrap.innerHTML = [
        '<div class="krit-auth-account-card">',
          '<div class="krit-account-shell">',
            '<aside class="krit-account-sidebar">',
              '<div class="krit-account-profile-head">',
                '<div class="krit-account-avatar">K</div>',
                '<div>',
                  '<div class="krit-account-greeting" id="krit-account-greeting">Hello, KRIT</div>',
                  '<div class="krit-auth-title" id="auth-account-name">KRIT Customer</div>',
                  '<div class="krit-account-provider" id="krit-account-provider">customer account</div>',
                '</div>',
              '</div>',
              '<div class="krit-auth-account-grid">',
                '<div class="krit-auth-account-meta"><div class="label">Email</div><div class="value" id="auth-account-email">hello@kritsleep.in</div></div>',
                '<div class="krit-auth-account-meta"><div class="label">Mobile</div><div class="value" id="auth-account-phone">Add your phone in checkout</div></div>',
              '</div>',
              '<div class="krit-account-quickstats">',
                '<div class="krit-account-stat"><span>Orders</span><strong id="krit-account-order-count">0</strong></div>',
                '<div class="krit-account-stat"><span>Open</span><strong id="krit-account-pending-count">0</strong></div>',
                '<div class="krit-account-stat"><span>Spend</span><strong id="krit-account-total-spent">Rs 0</strong></div>',
              '</div>',
              '<div class="krit-account-nav">',
                '<button type="button" class="krit-account-nav-btn active" data-krit-account-tab="orders" onclick="switchAccountPanel(\'orders\')">My orders</button>',
                '<button type="button" class="krit-account-nav-btn" data-krit-account-tab="profile" onclick="switchAccountPanel(\'profile\')">Profile</button>',
                '<button type="button" class="krit-account-nav-btn" data-krit-account-tab="support" onclick="switchAccountPanel(\'support\')">Addresses & payments</button>',
              '</div>',
              '<button class="kd-logout" type="button" onclick="kritLogout()">Logout</button>',
            '</aside>',
            '<div class="krit-account-content">',
              '<section class="krit-account-panel" data-krit-account-panel="orders">',
                '<div class="krit-account-panel-head">',
                  '<div>',
                    '<div class="krit-auth-title">My orders</div>',
                    '<div class="krit-auth-sub" id="krit-account-subtitle">Track all your orders, payment states, delivery progress, and saved customer details in one place.</div>',
                  '</div>',
                '</div>',
                '<div id="krit-account-orders-list" class="krit-account-orders-list"></div>',
              '</section>',
              '<section class="krit-account-panel" data-krit-account-panel="profile" style="display:none">',
                '<div class="krit-auth-title">Profile details</div>',
                '<div class="krit-account-profile-grid">',
                  '<div class="krit-auth-account-meta"><div class="label">Full name</div><div class="value" id="krit-profile-name">KRIT Customer</div></div>',
                  '<div class="krit-auth-account-meta"><div class="label">Login provider</div><div class="value" id="krit-profile-provider">customer account</div></div>',
                  '<div class="krit-auth-account-meta"><div class="label">Email address</div><div class="value" id="krit-profile-email">hello@kritsleep.in</div></div>',
                  '<div class="krit-auth-account-meta"><div class="label">Mobile number</div><div class="value" id="krit-profile-phone">Add your phone in checkout</div></div>',
                '</div>',
              '</section>',
              '<section class="krit-account-panel" data-krit-account-panel="support" style="display:none">',
                '<div class="krit-auth-title">Addresses & payments</div>',
                '<div class="krit-account-support-grid">',
                  '<div class="krit-auth-account-meta"><div class="label">Latest delivery address</div><div class="value" id="krit-account-address">Add your delivery address during checkout.</div></div>',
                  '<div class="krit-auth-account-meta"><div class="label">Payment methods</div><div class="value">UPI, cards, netbanking, and COD are available during checkout. Saved wallets can be added next.</div></div>',
                  '<div class="krit-auth-account-meta"><div class="label">Support</div><div class="value">Need help with a shipment or payment? Reach KRIT support for quick order assistance.</div></div>',
                '</div>',
              '</section>',
            '</div>',
          '</div>',
        '</div>'
      ].join('');
    }

    if(close) card.appendChild(close);
    main.appendChild(message);
    main.appendChild(formWrap);
    main.appendChild(accountWrap);
    while(card.firstChild) card.removeChild(card.firstChild);
    card.appendChild(close);
    card.appendChild(side);
    card.appendChild(main);
    ensureAuthFormEnhancements();
  }

  function ensureAuthFormEnhancements(){
    var form = document.getElementById('krit-auth-form');
    if(!form) return;

    var submitBtn = document.getElementById('auth-email-btn');
    if(submitBtn){
      submitBtn.className = 'krit-btn krit-btn-primary';
    }

    if(!document.getElementById('krit-google-btn')){
      var googleBtn = document.createElement('button');
      googleBtn.type = 'button';
      googleBtn.id = 'krit-google-btn';
      googleBtn.className = 'krit-btn krit-btn-google';
      googleBtn.innerHTML = '<span class="krit-google-mark">G</span> Continue with Google';
      googleBtn.onclick = function(){ window.kritContinueWithGoogle && window.kritContinueWithGoogle(); };

      var googleDivider = document.createElement('div');
      googleDivider.className = 'krit-or';
      googleDivider.innerHTML = '<span>or continue with email</span>';

      form.insertAdjacentElement('afterbegin', googleDivider);
      form.insertAdjacentElement('afterbegin', googleBtn);
    }

    if(!document.getElementById('krit-otp-login-wrap')){
      var otpWrap = document.createElement('div');
      otpWrap.id = 'krit-otp-login-wrap';
      otpWrap.className = 'krit-auth-otp-wrap';
      otpWrap.innerHTML = [
        '<div class="krit-auth-otp-title">Mobile OTP login</div>',
        '<div class="krit-auth-otp-copy">Use just your mobile number to sign in and continue checkout.</div>',
        '<div class="krit-field"><label class="krit-label" for="auth-otp-phone">Mobile number</label><input class="krit-input" id="auth-otp-phone" type="tel" inputmode="numeric" maxlength="10" placeholder="Enter your 10-digit mobile number" autocomplete="tel-national"></div>',
        '<button type="button" id="krit-send-otp-btn" class="krit-btn krit-btn-otp">Send OTP</button>',
        '<div id="krit-otp-verify-wrap" style="display:none" class="krit-auth-otp-verify">',
          '<div class="krit-field"><label class="krit-label" for="krit-otp-code">OTP code</label><input class="krit-input" id="krit-otp-code" type="text" inputmode="numeric" maxlength="6" placeholder="Enter 6-digit OTP" autocomplete="one-time-code"></div>',
          '<button type="button" id="krit-verify-otp-btn" class="krit-btn krit-btn-primary">Verify OTP</button>',
        '</div>'
      ].join('');

      var dividerOtp = document.createElement('div');
      dividerOtp.className = 'krit-or';
      dividerOtp.innerHTML = '<span>or login with OTP</span>';

      var dividerEmail = document.createElement('div');
      dividerEmail.className = 'krit-or';
      dividerEmail.innerHTML = '<span>or continue with email</span>';

      var firstChild = form.firstChild;
      if(firstChild){
        form.insertBefore(dividerOtp, firstChild);
        form.insertBefore(otpWrap, dividerOtp.nextSibling);
        form.insertBefore(dividerEmail, otpWrap.nextSibling);
      } else {
        form.appendChild(dividerOtp);
        form.appendChild(otpWrap);
        form.appendChild(dividerEmail);
      }

      var otpBtn = otpWrap.querySelector('#krit-send-otp-btn');
      var verifyBtn = otpWrap.querySelector('#krit-verify-otp-btn');
      if(otpBtn) otpBtn.onclick = function(){ window.kritSendOtpLogin && window.kritSendOtpLogin(); };
      if(verifyBtn) verifyBtn.onclick = function(){ window.kritVerifyOtpLogin && window.kritVerifyOtpLogin(); };
    }

    if(!form.querySelector('.krit-auth-inline-note')){
      var note = document.createElement('div');
      note.className = 'krit-auth-inline-note';
      note.textContent = 'Use Google for one-tap sign-in, use mobile OTP, or create an email account with a secure password.';
      form.appendChild(note);
    }
  }

  function updateAuthUI(){
    var formWrap = document.getElementById('krit-auth-form-wrap');
    var accountWrap = document.getElementById('krit-auth-account');
    var welcome = document.getElementById('auth-welcome');
    var authCard = document.querySelector('.krit-auth-card.krit-auth-premium');
    var nameNode = document.getElementById('auth-account-name');
    var emailNode = document.getElementById('auth-account-email');
    var phoneNode = document.getElementById('auth-account-phone');
    var profileNameNode = document.getElementById('krit-profile-name');
    var profileEmailNode = document.getElementById('krit-profile-email');
    var profilePhoneNode = document.getElementById('krit-profile-phone');
    var profileProviderNode = document.getElementById('krit-profile-provider');
    if(!formWrap || !accountWrap || !welcome) return;
    if(window._kritAccount && (window._kritAccount.email || window._kritAccount.phone)){
      formWrap.style.display = 'none';
      accountWrap.style.display = 'block';
      if(authCard) authCard.classList.add('krit-account-mode');
      accountWrap.scrollTop = 0;
      if(nameNode) nameNode.textContent = window._kritAccount.name || 'KRIT Customer';
      if(emailNode) emailNode.textContent = window._kritAccount.email || 'Mobile verified account';
      if(phoneNode) phoneNode.textContent = window._kritAccount.phone ? '+91 ' + window._kritAccount.phone : 'Add your phone during checkout';
      if(profileNameNode) profileNameNode.textContent = window._kritAccount.name || 'KRIT Customer';
      if(profileEmailNode) profileEmailNode.textContent = window._kritAccount.email || 'Mobile verified account';
      if(profilePhoneNode) profilePhoneNode.textContent = window._kritAccount.phone ? '+91 ' + window._kritAccount.phone : 'Add your phone during checkout';
      if(profileProviderNode) profileProviderNode.textContent = window._kritAccount.provider ? String(window._kritAccount.provider).replace(/_/g, ' ') : 'customer account';
      welcome.querySelector('.krit-auth-title').textContent = 'Your KRIT account';
      welcome.querySelector('.krit-auth-sub').textContent = 'Saved details, wishlist continuity, and order visibility in one place.';
      renderAccountDashboard();
    } else {
      formWrap.style.display = 'block';
      accountWrap.style.display = 'none';
      if(authCard) authCard.classList.remove('krit-account-mode');
      window.switchAuthTab && window.switchAuthTab(window._kritAuthTab || 'login');
    }
  }

  function switchAuthTab(tab){
    window._kritAuthTab = tab === 'signup' ? 'signup' : 'login';
    var isLogin = window._kritAuthTab === 'login';
    var tabLogin = document.getElementById('tab-login');
    var tabSignup = document.getElementById('tab-signup');
    var nameWrap = document.getElementById('auth-name-wrap');
    var phoneWrap = document.getElementById('auth-phone-wrap');
    var passwordWrap = document.getElementById('auth-password-wrap');
    var phoneInput = document.getElementById('auth-phone');
    var passwordInput = document.getElementById('auth-password');
    var actionBtn = document.getElementById('auth-email-btn');
    var welcome = document.getElementById('auth-welcome');
    if(tabLogin) tabLogin.classList.toggle('active', isLogin);
    if(tabSignup) tabSignup.classList.toggle('active', !isLogin);
    if(tabLogin){ tabLogin.style.background = isLogin ? '#2F5DA8' : 'transparent'; tabLogin.style.color = isLogin ? '#fff' : 'rgba(255,255,255,.55)'; }
    if(tabSignup){ tabSignup.style.background = !isLogin ? '#2F5DA8' : 'transparent'; tabSignup.style.color = !isLogin ? '#fff' : 'rgba(255,255,255,.55)'; }
    if(nameWrap) nameWrap.style.display = isLogin ? 'none' : 'block';
    if(phoneWrap) phoneWrap.style.display = isLogin ? 'none' : 'grid';
    if(passwordWrap) passwordWrap.style.display = 'grid';
    if(phoneInput) phoneInput.required = !isLogin;
    if(passwordInput) passwordInput.required = true;
    if(actionBtn){
      actionBtn.textContent = isLogin ? 'Login with Email' : 'Create Account';
      actionBtn.className = 'krit-btn krit-btn-primary';
    }
    if(welcome){
      welcome.querySelector('.krit-auth-title').textContent = isLogin ? 'Welcome back to KRIT' : 'Create your KRIT account';
      welcome.querySelector('.krit-auth-sub').textContent = isLogin ? 'Continue with your email and password, or use Google if it is connected.' : 'Create a customer profile for faster checkout, saved wishlists, and order tracking.';
    }
    clearAuthMessage();
  }

  async function continueWithGoogle(){
    clearAuthMessage();
    authMessage('Connecting your Google account...', 'info');
    var fb = await ensureFirebase();
    if(!fb || !fb.auth){
      authMessage('Google login is not available right now. Please continue with email instead.', 'err');
      return;
    }
    try {
      var provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      var result = await fb.auth().signInWithPopup(provider);
      var user = result.user || {};
      var profile = {
        name: user.displayName || 'KRIT Customer',
        email: user.email || '',
        phone: user.phoneNumber ? String(user.phoneNumber).replace(/^\+91/, '') : '',
        avatar: user.photoURL || '',
        uid: user.uid || '',
        provider: 'google',
        createdAt: new Date().toISOString()
      };
      if(typeof window.kritPersistAccount === 'function') window.kritPersistAccount(profile);
      await saveCustomerProfile(profile, 'google');
      updateAuthUI();
      track('login', { method: 'google' });
      authMessage('Google account connected successfully.', 'ok');
      setTimeout(function(){
        if(typeof window.closeAuthModal === 'function') window.closeAuthModal();
        continuePendingCheckout();
      }, 600);
    } catch(error) {
      authMessage(firebaseAuthErrorMessage(error, 'google'), 'err');
    }
  }

  async function submitAuth(){
    clearAuthMessage();
    var nameEl = document.getElementById('auth-name');
    var emailEl = document.getElementById('auth-email');
    var phoneEl = document.getElementById('auth-phone');
    var passwordEl = document.getElementById('auth-password');
    var name = nameEl ? nameEl.value.trim() : '';
    var email = emailEl ? emailEl.value.trim().toLowerCase() : '';
    var phone = phoneEl ? phoneEl.value.replace(/\D/g,'').trim() : '';
    var password = passwordEl ? passwordEl.value : '';
    if(window._kritAuthTab === 'signup' && name.length < 2){ authMessage('Please enter your full name.', 'err'); return; }
    if(typeof window.kritValidEmail === 'function' && !window.kritValidEmail(email)){ authMessage('Please enter a valid email address.', 'err'); return; }
    if(phone && typeof window.kritValidPhone === 'function' && !window.kritValidPhone(phone)){ authMessage('Please enter a valid 10-digit mobile number.', 'err'); return; }
    if(window._kritAuthTab === 'signup' && !phone){ authMessage('Please enter a mobile number so we can save your customer profile correctly.', 'err'); return; }
    if(password.length < 6){ authMessage('Please enter a password with at least 6 characters.', 'err'); return; }

    var fb = await ensureFirebase();
    if(!fb || !fb.auth){
      authMessage('Live account login is not available yet. Please refresh and try again.', 'err');
      return;
    }

    if(window._kritAuthTab === 'login'){
      try {
        var loginResult = await fb.auth().signInWithEmailAndPassword(email, password);
        var loginUser = loginResult.user || {};
        var stored = null;
        try { stored = JSON.parse(localStorage.getItem('krit_account_profile') || 'null'); } catch(e) { stored = null; }
        var loginProfile = {
          uid: loginUser.uid || '',
          name: (stored && stored.name) || (loginUser.displayName || 'KRIT Customer'),
          email: email,
          phone: (stored && stored.phone) || phone || '',
          avatar: loginUser.photoURL || '',
          provider: 'email',
          createdAt: (stored && stored.createdAt) || new Date().toISOString()
        };
        if(typeof window.kritPersistAccount === 'function') window.kritPersistAccount(loginProfile);
        await saveCustomerProfile(loginProfile, 'email-login');
        updateAuthUI();
        track('login', { method: 'email' });
        logVisit();
      if(window.kritToast) window.kritToast('Welcome back to KRIT');
      if(typeof window.closeAuthModal === 'function') window.closeAuthModal();
      continuePendingCheckout();
    } catch(error) {
      if(error && error.code === 'auth/user-not-found'){
        authMessage('No account exists with this email yet. Please create an account first.', 'err');
      } else if(error && error.code === 'auth/wrong-password'){
        authMessage('The password is incorrect. Please try again.', 'err');
      } else if(error && error.code === 'auth/invalid-credential'){
        authMessage('The email or password is incorrect. Please try again.', 'err');
      } else if(error && error.code === 'auth/too-many-requests'){
        authMessage('Too many login attempts were made. Please wait a moment and try again.', 'err');
      } else {
        authMessage(firebaseAuthErrorMessage(error, 'email'), 'err');
      }
      }
      return;
    }

    try {
      var signupResult = await fb.auth().createUserWithEmailAndPassword(email, password);
      var signupUser = signupResult.user || {};
      if(signupUser.updateProfile){
        try { await signupUser.updateProfile({ displayName: name }); } catch(e){}
      }
      var profile = {
        uid: signupUser.uid || '',
        name: name,
        email: email,
        phone: phone,
        provider: 'email',
        createdAt: new Date().toISOString()
      };
      if(typeof window.kritPersistAccount === 'function') window.kritPersistAccount(profile);
      await saveCustomerProfile(profile, 'email-signup');
      updateAuthUI();
      track('sign_up', { method: 'email' });
      logVisit();
      if(window.kritToast) window.kritToast('Your KRIT account has been created');
      if(typeof window.closeAuthModal === 'function') window.closeAuthModal();
      continuePendingCheckout();
    } catch(error) {
      if(error && error.code === 'auth/email-already-in-use'){
        authMessage('This email already has an account. Please log in instead.', 'err');
      } else if(error && error.code === 'auth/weak-password'){
        authMessage('Please use a stronger password with at least 6 characters.', 'err');
      } else {
        authMessage(firebaseAuthErrorMessage(error, 'email'), 'err');
      }
    }
  }

  function ensureDetailShare(){
    var detail = document.querySelector('#krit-detail-layout > div:last-child');
    if(!detail) return null;
    var desc = document.getElementById('detail-desc');
    var existing = document.getElementById('krit-detail-share-wrap');
    if(existing) return existing;
    var wrap = document.createElement('div');
    wrap.id = 'krit-detail-share-wrap';
    wrap.innerHTML = [
      '<div class="krit-share-note">Share this product or open the KRIT social pages to spotlight it in your Facebook or Instagram journey.</div>',
      '<div id="krit-detail-share">',
        '<button type="button" class="krit-share-btn" data-action="native">Share</button>',
        '<button type="button" class="krit-share-btn facebook" data-action="facebook">Facebook</button>',
        '<button type="button" class="krit-share-btn instagram" data-action="instagram">Instagram</button>',
        '<button type="button" class="krit-share-btn copy" data-action="copy">Copy Link</button>',
      '</div>'
    ].join('');
    if(desc && desc.parentNode) desc.insertAdjacentElement('afterend', wrap);
    wrap.addEventListener('click', function(event){
      var btn = event.target.closest('button[data-action]');
      if(!btn) return;
      var action = btn.getAttribute('data-action');
      if(action === 'native') shareCurrentProduct();
      if(action === 'facebook') shareToFacebook();
      if(action === 'instagram') openInstagramHighlight();
      if(action === 'copy') copyCurrentProductLink();
    });
    return wrap;
  }

  function ensureLightboxEnhancements(){
    var overlay = document.getElementById('krit-image-lightbox');
    if(!overlay) return;
    var img = document.getElementById('krit-lightbox-img');
    if(img && !img.parentNode.id === 'krit-lightbox-stage'){}
    if(img && img.parentNode !== overlay.querySelector('#krit-lightbox-stage')){
      var stage = document.createElement('div');
      stage.id = 'krit-lightbox-stage';
      overlay.insertBefore(stage, img);
      stage.appendChild(img);
    }
    if(!document.getElementById('krit-lightbox-thumbs')){
      lightboxThumbsEl = document.createElement('div');
      lightboxThumbsEl.id = 'krit-lightbox-thumbs';
      overlay.appendChild(lightboxThumbsEl);
    } else {
      lightboxThumbsEl = document.getElementById('krit-lightbox-thumbs');
    }
    var actions = document.getElementById('krit-lightbox-actions');
    if(actions && !document.getElementById('krit-lightbox-share')){
      var shareBtn = document.createElement('button');
      shareBtn.id = 'krit-lightbox-share';
      shareBtn.type = 'button';
      shareBtn.textContent = 'Share Product';
      shareBtn.onclick = shareCurrentProduct;
      actions.appendChild(shareBtn);
    }
  }

  function renderLightboxThumbs(){
    ensureLightboxEnhancements();
    if(!lightboxThumbsEl) return;
    var product = getCurrentProduct();
    if(!product || !product.images) { lightboxThumbsEl.innerHTML = ''; return; }
    lightboxThumbsEl.innerHTML = product.images.map(function(src, index){
      var label = product.name + ' thumbnail ' + (index + 1);
      var active = index === window._kritCurrentImageIndex ? 'active' : '';
      var escaped = String(src).replace(/'/g, "%27");
      return '<button type="button" class="' + active + '" aria-label="Open image ' + (index + 1) + '" onclick="window._kritCurrentImageIndex=' + index + ';kritSyncLightboxImage()" style="background-image:url(\'' + escaped + '\');background-size:cover;background-position:center center;background-repeat:no-repeat"></button>';
    }).join('');
  }

  function shareCurrentProduct(){
    var product = getCurrentProduct();
    if(!product) return;
    var url = productShareUrl(product);
    var text = 'Take a look at the ' + product.name + ' from KRIT.';
    track('share', { method: 'native', item_id: product.id, item_name: product.name });
    if(navigator.share){
      navigator.share({ title: 'KRIT ' + product.name, text: text, url: url }).catch(function(){});
    } else {
      copyCurrentProductLink();
    }
  }

  function shareToFacebook(){
    var product = getCurrentProduct();
    if(!product) return;
    var url = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(productShareUrl(product));
    track('share', { method: 'facebook', item_id: product.id, item_name: product.name });
    window.open(url, '_blank', 'noopener,noreferrer,width=680,height=560');
  }

  function openInstagramHighlight(){
    var product = getCurrentProduct();
    if(!product) return;
    track('share', { method: 'instagram', item_id: product.id, item_name: product.name });
    if(navigator.share){
      navigator.share({ title: 'KRIT ' + product.name, text: 'Sharing ' + product.name + ' from KRIT', url: productShareUrl(product) }).catch(function(){
        window.open(CONFIG.instagramUrl, '_blank', 'noopener,noreferrer');
      });
    } else {
      window.open(CONFIG.instagramUrl, '_blank', 'noopener,noreferrer');
    }
  }

  function copyCurrentProductLink(){
    var product = getCurrentProduct();
    if(!product) return;
    var url = productShareUrl(product);
    track('share', { method: 'copy_link', item_id: product.id, item_name: product.name });
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ if(window.kritToast) window.kritToast('Product link copied'); });
    } else {
      if(window.kritToast) window.kritToast(url);
    }
  }

  function wrapTracking(){
    if(typeof window.kritOpenDetail === 'function' && !window.kritOpenDetail.__kritTracked){
      var originalOpenDetail = window.kritOpenDetail;
      window.kritOpenDetail = function(){
        var result = originalOpenDetail.apply(this, arguments);
        var product = getCurrentProduct();
        if(product){
          syncProductMeta(product);
          ensureDetailShare();
          track('view_item', {
            currency: 'INR',
            value: product.price,
            items: [{ item_id: product.id, item_name: product.name, price: product.price, item_category: product.categoryLabel || product.category }]
          });
        }
        return result;
      };
      window.kritOpenDetail.__kritTracked = true;
    }
    if(typeof window.addToCart === 'function' && !window.addToCart.__kritTracked){
      var originalAddToCart = window.addToCart;
      window.addToCart = function(name, price, qty, productId){
        var result = originalAddToCart.apply(this, arguments);
        track('add_to_cart', { currency: 'INR', value: Number(price || 0) * Number(qty || 1), items:[{ item_id: productId || name, item_name: name, price: Number(price || 0), quantity: Number(qty || 1) }] });
        return result;
      };
      window.addToCart.__kritTracked = true;
    }
    if(typeof window.addToWishlist === 'function' && !window.addToWishlist.__kritTracked){
      var originalAddToWishlist = window.addToWishlist;
      window.addToWishlist = function(name, price, productId){
        var result = originalAddToWishlist.apply(this, arguments);
        track('add_to_wishlist', { currency: 'INR', value: Number(price || 0), items:[{ item_id: productId || name, item_name: name, price: Number(price || 0), quantity: 1 }] });
        return result;
      };
      window.addToWishlist.__kritTracked = true;
    }
    if(typeof window.kritOpenCheckout === 'function' && !window.kritOpenCheckout.__kritTracked){
      var originalCheckout = window.kritOpenCheckout;
      window.kritOpenCheckout = function(items){
        try {
          var total = Array.isArray(items) ? items.reduce(function(sum, item){ return sum + ((item.price || 0) * (item.qty || 1)); }, 0) : 0;
          track('begin_checkout', { currency: 'INR', value: total });
        } catch(e){}
        return originalCheckout.apply(this, arguments);
      };
      window.kritOpenCheckout.__kritTracked = true;
    }
  }

  function patchLightboxSync(){
    if(typeof window.kritSyncLightboxImage === 'function' && !window.kritSyncLightboxImage.__kritEnhanced){
      var originalSync = window.kritSyncLightboxImage;
      window.kritSyncLightboxImage = function(){
        var result = originalSync.apply(this, arguments);
        renderLightboxThumbs();
        return result;
      };
      window.kritSyncLightboxImage.__kritEnhanced = true;
    }
  }

  function patchAuthFns(){
    window.kritUpdateAccountUI = updateAuthUI;
    window.switchAuthTab = switchAuthTab;
    window.kritSubmitAuth = submitAuth;
    window.kritContinueWithGoogle = continueWithGoogle;
    window.kritSendOtpLogin = sendOtpLogin;
    window.kritVerifyOtpLogin = verifyOtpLogin;
    window.switchAccountPanel = switchAccountPanel;
    window.openTrackModal = openTrackModal;
    window.openAccountOrderTracker = openAccountOrderTracker;
    window.openAccountOrderShipment = openAccountOrderShipment;
    window.kritCloseAccountOrderDetails = closeAccountOrderDetails;
    window.kritLogout = async function(){
      try {
        var fb = await ensureFirebase();
        if(fb && fb.auth && fb.auth().currentUser){
          await fb.auth().signOut();
        }
      } catch(e){}
      localStorage.removeItem('krit_account_profile');
      window._kritAccount = null;
      updateAuthUI();
      if(window.kritToast) window.kritToast('Logged out');
      if(typeof window.closeAuthModal === 'function') window.closeAuthModal();
    };
    window.openAuthModal = function(){
      var overlay = document.getElementById('krit-auth-overlay');
      if(!overlay) return;
      var nameEl = document.getElementById('auth-name');
      var emailEl = document.getElementById('auth-email');
      var phoneEl = document.getElementById('auth-phone');
      var passwordEl = document.getElementById('auth-password');
      ensureAuthFormEnhancements();
      if(!window._kritAccount){
        switchAuthTab(window._kritAuthTab || 'login');
        if(nameEl) nameEl.value = '';
        if(emailEl) emailEl.value = '';
        if(phoneEl) phoneEl.value = '';
        if(passwordEl) passwordEl.value = '';
      }
      updateAuthUI();
      overlay.classList.add('open');
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      authMessage('Create an account, continue with Google, or use mobile OTP to unlock checkout.', 'info');
    };
    window.closeAuthModal = function(){
      var overlay = document.getElementById('krit-auth-overlay');
      if(!overlay) return;
      overlay.classList.remove('open');
      overlay.style.display = 'none';
      document.body.style.overflow = '';
    };
  }

  function bindAuthModalControls(){
    var overlay = document.getElementById('krit-auth-overlay');
    if(!overlay) return;

    if(!overlay.__kritBackdropBound){
      overlay.addEventListener('click', function(event){
        if(event.target === overlay && typeof window.closeAuthModal === 'function'){
          window.closeAuthModal();
        }
      });
      overlay.__kritBackdropBound = true;
    }

    var close = overlay.querySelector('.krit-auth-close');
    if(close && !close.__kritCloseBound){
      close.addEventListener('click', function(event){
        event.preventDefault();
        event.stopPropagation();
        if(typeof window.closeAuthModal === 'function'){
          window.closeAuthModal();
        }
      });
      close.__kritCloseBound = true;
    }

    if(!document.__kritAuthEscBound){
      document.addEventListener('keydown', function(event){
        if(event.key !== 'Escape') return;
        var authOverlay = document.getElementById('krit-auth-overlay');
        if(!authOverlay) return;
        var isVisible = authOverlay.classList.contains('open') || authOverlay.style.display === 'flex';
        if(isVisible && typeof window.closeAuthModal === 'function'){
          window.closeAuthModal();
        }
      });
      document.__kritAuthEscBound = true;
    }
  }

  function bootFacebookPixel(){
    if(!CONFIG.facebookPixelId || window.fbq) return;
    !(function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod? n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)})(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', CONFIG.facebookPixelId);
    window.fbq('track', 'PageView');
  }

  function refinePrivacyCopy(){
    var dataStorageTitle = Array.from(document.querySelectorAll('.im-section-title')).find(function(el){ return el.textContent.trim() === 'Data storage'; });
    if(dataStorageTitle){
      var text = dataStorageTitle.parentElement.querySelector('.im-text');
      if(text){
        text.textContent = 'Customer accounts, website visits, and order records are stored securely in Firebase / Google Cloud and can sync into KRIT ERP for follow-up, support, and order operations.';
      }
    }
    var cookiesTitle = Array.from(document.querySelectorAll('.im-section-title')).find(function(el){ return el.textContent.trim() === 'Cookies'; });
    if(cookiesTitle){
      var ctext = cookiesTitle.parentElement.querySelector('.im-text');
      if(ctext){
        ctext.textContent = 'This website uses Google Analytics for traffic insights and Firebase Auth / Firestore for customer accounts and visit tracking. Meta Pixel can also be enabled from the ecommerce config when you start paid social campaigns.';
      }
    }
  }

  function enhance(){
    premiumizeAuthMarkup();
    patchAuthFns();
    bindAuthModalControls();
    updateAuthUI();
    wrapTracking();
    patchLightboxSync();
    ensureDetailShare();
    ensureLightboxEnhancements();
    refinePrivacyCopy();
    bootFacebookPixel();
    bindFirebaseAuthState();
    logVisit();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', enhance);
  } else {
    enhance();
  }
  window.addEventListener('load', enhance);
  setTimeout(enhance, 300);
  setTimeout(enhance, 900);
})();


(function(){
  var CONFIG = window.KRIT_ECOMMERCE || {};

  function mobilePanel(){
    var drw = document.getElementById('drw');
    if(!drw || drw.dataset.kritMobileReady === 'true') return;
    drw.dataset.kritMobileReady = 'true';
    var closeBtn = document.getElementById('dc');
    var panel = document.createElement('div');
    panel.className = 'krit-mobile-panel';
    var children = Array.from(drw.children).filter(function(node){ return node !== closeBtn; });
    children.forEach(function(node){ panel.appendChild(node); });
    if(closeBtn) drw.appendChild(closeBtn);
    drw.appendChild(panel);

    function openDrw(){
      drw.classList.add('open');
      document.body.style.overflow = 'hidden';
      var btn = document.getElementById('hbtn');
      if(btn) btn.classList.add('open');
    }
    function closeDrw(){
      drw.classList.remove('open');
      document.body.style.overflow = '';
      var btn = document.getElementById('hbtn');
      if(btn) btn.classList.remove('open');
    }
    window.openDrw = openDrw;
    window.closeDrw = closeDrw;

    var hbtn = document.getElementById('hbtn');
    if(hbtn && !hbtn.dataset.kritBound){
      hbtn.dataset.kritBound = 'true';
      hbtn.addEventListener('click', function(){ drw.classList.contains('open') ? closeDrw() : openDrw(); });
    }
    if(closeBtn && !closeBtn.dataset.kritBound){
      closeBtn.dataset.kritBound = 'true';
      closeBtn.addEventListener('click', closeDrw);
    }
    drw.addEventListener('click', function(event){ if(event.target === drw) closeDrw(); });
    document.addEventListener('keydown', function(event){ if(event.key === 'Escape' && drw.classList.contains('open')) closeDrw(); });
  }

  function prefillCheckoutFields(){
    if(!window._kritAccount) return;
    var account = window._kritAccount;
    var name = document.getElementById('krit-co-name');
    var phone = document.getElementById('krit-co-phone');
    var email = document.getElementById('krit-co-email');
    if(name && !name.value) name.value = account.name || '';
    if(phone && !phone.value) phone.value = account.phone || CONFIG.supportPhone || '';
    if(email && !email.value) email.value = account.email || '';
  }

  function upgradeCheckoutFields(scope){
    var map = [
      ['krit-co-name','Full name',false],
      ['krit-co-phone','Mobile number',false],
      ['krit-co-email','Email address',false],
      ['krit-co-city','City',false],
      ['krit-co-pincode','Pincode',false],
      ['krit-co-address','Shipping address',true],
      ['krit-co-notes','Order notes',true]
    ];
    map.forEach(function(entry){
      var field = document.getElementById(entry[0]);
      if(!field || field.dataset.kritField === 'true') return;
      field.dataset.kritField = 'true';
      var wrapper = document.createElement('div');
      wrapper.className = 'krit-checkout-field' + (entry[0] === 'krit-co-email' || entry[0] === 'krit-co-address' || entry[0] === 'krit-co-notes' ? ' full' : '');
      var label = document.createElement('label');
      label.setAttribute('for', entry[0]);
      label.textContent = entry[1];
      field.parentNode.insertBefore(wrapper, field);
      wrapper.appendChild(label);
      wrapper.appendChild(field);
    });
  }

  function enhanceCheckoutOverlay(){
    var overlay = document.getElementById('krit-checkout-overlay');
    if(!overlay || overlay.dataset.kritEnhanced === 'true') return;
    overlay.dataset.kritEnhanced = 'true';
    overlay.classList.add('krit-checkout-shell');
    var card = overlay.firstElementChild;
    if(card) card.classList.add('krit-checkout-card');
    var grid = card && card.firstElementChild;
    if(grid) grid.classList.add('krit-checkout-grid');
    var panes = grid ? Array.from(grid.children) : [];
    if(panes[0]) panes[0].classList.add('krit-checkout-pane');
    if(panes[1]) panes[1].classList.add('krit-checkout-pane','summary');

    if(panes[0] && !document.getElementById('krit-checkout-steps')){
      var header = panes[0].children[0];
      var steps = document.createElement('div');
      steps.id = 'krit-checkout-steps';
      steps.className = 'krit-checkout-steps';
      steps.innerHTML = '<div class="krit-checkout-step active">Details</div><div class="krit-checkout-step">Payment</div><div class="krit-checkout-step">Confirmation</div>';
      header.insertAdjacentElement('afterend', steps);

      var support = document.createElement('div');
      support.className = 'krit-checkout-support';
      support.innerHTML = [
        '<div class="item"><div class="k">Support email</div><div class="v">' + (CONFIG.supportEmail || 'hello@kritsleep.in') + '</div></div>',
        '<div class="item"><div class="k">Support phone</div><div class="v">+91 ' + (CONFIG.supportPhone || '9611211121') + '</div></div>',
        '<div class="item"><div class="k">ERP order sync</div><div class="v">Orders sync to KRIT ERP after submission.</div></div>'
      ].join('');
      steps.insertAdjacentElement('afterend', support);
    }

    var formGrid = panes[0] && panes[0].querySelector('div[style*="grid-template-columns:1fr 1fr"]');
    if(formGrid){
      formGrid.classList.add('krit-checkout-form-grid');
      upgradeCheckoutFields(formGrid);
    }

    if(panes[0] && !panes[0].querySelector('.krit-checkout-inline-note')){
      var paymentStart = panes[0].querySelector('div[style*="margin-top:22px"]');
      if(paymentStart){
        var note = document.createElement('div');
        note.className = 'krit-checkout-inline-note';
        note.textContent = 'Your account details will prefill here when available. Online payments confirm faster and sync more cleanly into your order journey.';
        paymentStart.parentNode.insertBefore(note, paymentStart);
      }
    }

    if(panes[1] && !panes[1].querySelector('.krit-checkout-summary-card')){
      var card2 = document.createElement('div');
      card2.className = 'krit-checkout-summary-card';
      card2.innerHTML = '<div class="eyebrow">Why this flow feels better</div><div class="copy">Customers can review details, choose payment clearly, and move into a cleaner confirmation state while your order data is prepared for ERP sync.</div>';
      panes[1].appendChild(card2);
    }

    prefillCheckoutFields();
  }

  function ensureKritOverlayStyles(){
    if(document.getElementById('krit-commerce-enhanced-styles')) return;
    var style = document.createElement('style');
    style.id = 'krit-commerce-enhanced-styles';
    style.textContent = [
      '.krit-checkout-card{width:min(1120px,calc(100vw - 56px))!important;max-height:min(90vh,940px)!important;overflow:auto!important;border-radius:28px!important;box-shadow:0 30px 90px rgba(2,8,23,.58)!important;}',
      '.krit-checkout-grid{gap:20px!important;}',
      '.krit-checkout-pane{padding:22px 24px!important;}',
      '.krit-checkout-pane.summary{padding:22px 24px!important;}',
      '.krit-checkout-support{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px!important;margin:16px 0 20px!important;}',
      '.krit-checkout-support .item{padding:14px 16px!important;border-radius:18px!important;}',
      '.krit-checkout-form-grid{gap:14px!important;}',
      '.krit-checkout-inline-note{margin:14px 0 18px!important;padding:14px 16px!important;border-radius:18px!important;line-height:1.65!important;}',
      '.krit-checkout-summary-card{margin-top:18px!important;padding:18px 18px!important;border-radius:20px!important;}',
      '.krit-order-success-dialog{width:min(1040px,calc(100vw - 48px))!important;max-height:min(92vh,920px)!important;overflow:auto!important;border-radius:30px!important;box-shadow:0 32px 100px rgba(3,10,24,.62)!important;}',
      '.krit-order-success-head{background:linear-gradient(180deg,rgba(20,62,41,.76),rgba(15,32,56,.18))!important;}',
      '.krit-order-success-badge{background:rgba(34,197,94,.12)!important;border:1px solid rgba(126,231,157,.28)!important;color:#d7ffe3!important;}',
      '.krit-order-success-hero{align-items:center!important;}',
      '.krit-order-success-hero-icon{background:radial-gradient(circle at 30% 30%,rgba(126,231,157,.34),rgba(34,197,94,.12))!important;box-shadow:0 0 0 1px rgba(126,231,157,.18),0 18px 40px rgba(34,197,94,.18)!important;transform:scale(1.06)!important;}',
      '.krit-order-success-title{color:#f4fff8!important;}',
      '.krit-order-success-copy{max-width:760px!important;}',
      '.krit-order-success-celebration span{background:rgba(126,231,157,.13)!important;border:1px solid rgba(126,231,157,.2)!important;color:#b8ffd1!important;}',
      '.krit-order-success-grid{gap:16px!important;}',
      '.krit-order-success-card{padding:22px!important;border-radius:22px!important;}',
      '.krit-order-success-card.highlight{background:linear-gradient(180deg,rgba(34,197,94,.12),rgba(8,17,32,.92))!important;}',
      '.krit-order-success-statusbar{background:linear-gradient(180deg,rgba(126,231,157,.14),rgba(15,23,42,.55))!important;border:1px solid rgba(126,231,157,.2)!important;}',
      '.krit-order-success-mini-grid{gap:12px!important;}',
      '.krit-order-success-mini-card{min-height:unset!important;padding:16px 16px!important;}',
      '.krit-order-success-actions{display:flex!important;flex-wrap:wrap!important;gap:12px!important;align-items:center!important;padding-top:18px!important;}',
      '.krit-order-success-actions .krit-btn{min-height:50px!important;padding:14px 18px!important;border-radius:16px!important;}',
      '@media (max-width:900px){.krit-checkout-card,.krit-order-success-dialog{width:min(100vw - 20px,760px)!important;max-height:92vh!important;}.krit-checkout-support{grid-template-columns:1fr!important;}.krit-checkout-grid{grid-template-columns:1fr!important;}.krit-checkout-pane,.krit-checkout-pane.summary{padding:18px 16px!important;}.krit-order-success-grid,.krit-order-success-mini-grid{grid-template-columns:1fr!important;}}'
    ].join('');
    document.head.appendChild(style);
  }

  async function syncOrderToERP(order){
    if(!order || order.erpSyncState === 'synced' || order.erpSyncState === 'syncing') return;
    order.erpSyncState = 'syncing';
    order.erpSyncMessage = 'Syncing to KRIT ERP...';
    try {
      var payload = {
        id: order.id,
        customer_name: order.customer && order.customer.name || 'KRIT Customer',
        customer_phone: order.customer && order.customer.phone || '',
        customer_email: order.customer && order.customer.email || '',
        customer_address: order.customer && order.customer.address || '',
        customer_city: order.customer && order.customer.city || '',
        customer_state: '',
        customer_pincode: order.customer && order.customer.pincode || '',
        payment_mode: order.paymentLabel || order.paymentMode || 'Website',
        date: (order.createdAt || new Date().toISOString()).slice(0,10),
        items: (order.items || []).map(function(item){
          return {
            product_id: item.id || '',
            sku: item.id || '',
            description: item.name,
            qty: item.qty,
            rate: item.price,
            gst_rate: 12,
            amount: item.qty * item.price
          };
        })
      };
      var response = await fetch('/api/erp/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var responseText = '';
      var responseBody = null;
      try {
        responseText = await response.text();
        responseBody = responseText ? JSON.parse(responseText) : null;
      } catch(_parseError) {
        responseBody = responseText || null;
      }
      order.erpSyncState = response.ok ? 'synced' : 'failed';
      order.erpSyncAt = new Date().toISOString();
      order.erpSyncMessage = response.ok
        ? 'Order synced to KRIT ERP.'
        : ((responseBody && responseBody.error) || ('ERP sync failed with status ' + response.status + '.'));
      localStorage.setItem('krit_orders', JSON.stringify(window._kritOrders || []));
      if(response.ok){
        notifyOrderStakeholdersForOrder(order);
        renderAccountDashboard();
      } else {
        console.error('KRIT ERP order sync failed', {
          orderId: order.id,
          status: response.status,
          body: responseBody
        });
        if(!order.erpSyncRetried){
          order.erpSyncRetried = true;
          setTimeout(function(){ syncOrderToERP(order); }, 2500);
        }
      }
    } catch(error) {
      order.erpSyncState = 'failed';
      order.erpSyncAt = new Date().toISOString();
      order.erpSyncMessage = error && error.message ? error.message : 'ERP request failed.';
      localStorage.setItem('krit_orders', JSON.stringify(window._kritOrders || []));
      console.error('KRIT ERP order sync error', { orderId: order.id, error: error });
      if(!order.erpSyncRetried){
        order.erpSyncRetried = true;
        setTimeout(function(){ syncOrderToERP(order); }, 2500);
      }
    }
  }

  async function notifyOrderStakeholdersForOrder(order){
    if(!order || order.notificationState === 'manual_ready') return;
    order.notificationState = 'manual_ready';
    order.notificationAt = new Date().toISOString();
    order.notificationMessage = 'Manual customer and owner messages are ready.';
    localStorage.setItem('krit_orders', JSON.stringify(window._kritOrders || []));
  }

  function formatOrderDateLabel(value){
    if(!value) return 'Just now';
    try {
      return new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch(_error){
      return String(value);
    }
  }

  var KRIT_OWNER_WHATSAPP_NUMBER = '919611211121';

  function getOrderItemsLabel(order){
    if(!order || !Array.isArray(order.items) || !order.items.length) return 'KRIT order';
    return order.items.map(function(item){
      if(!item) return '';
      return (item.name || 'KRIT item') + ' x' + (item.qty || 1);
    }).filter(Boolean).join(', ');
  }

  function buildCustomerOrderWhatsAppMessage(order){
    return [
      'Hi ' + (((order && order.customer && order.customer.name) || 'there').trim()) + ',',
      '',
      'Thank you for shopping with KRIT.',
      'Your order has been received successfully.',
      'Order ID: ' + ((order && order.id) || '-'),
      'Items: ' + getOrderItemsLabel(order),
      'Amount: Rs ' + Number((order && order.total) || 0).toLocaleString('en-IN'),
      'Payment: ' + (((order && (order.paymentLabel || order.paymentMode)) || 'Website')),
      '',
      'You can track your order anytime from your KRIT account.'
    ].join('\n');
  }

  function buildOwnerOrderWhatsAppMessage(order){
    return [
      'New KRIT order received',
      '',
      'Order ID: ' + ((order && order.id) || '-'),
      'Customer: ' + (((order && order.customer && order.customer.name) || 'KRIT Customer')),
      'Phone: ' + (((order && order.customer && order.customer.phone) || '-')),
      'Items: ' + getOrderItemsLabel(order),
      'Amount: Rs ' + Number((order && order.total) || 0).toLocaleString('en-IN'),
      'Payment: ' + (((order && (order.paymentLabel || order.paymentMode)) || 'Website')),
      'Address: ' + [
        order && order.customer && order.customer.address,
        order && order.customer && order.customer.city,
        order && order.customer && order.customer.pincode
      ].filter(Boolean).join(', ')
    ].join('\n');
  }

  function openWhatsAppMessage(phone, message){
    var digits = String(phone || '').replace(/[^0-9]/g, '');
    if(!digits){
      if(window.kritToast) window.kritToast('WhatsApp number is not available yet.');
      return;
    }
    window.open('https://wa.me/' + digits + '?text=' + encodeURIComponent(message || ''), '_blank', 'noopener,noreferrer');
  }

  function copyKritMessage(text, label){
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text || '').then(function(){
        if(window.kritToast) window.kritToast((label || 'Message') + ' copied');
      }).catch(function(){
        if(window.kritToast) window.kritToast('Could not copy automatically.');
      });
      return;
    }
    if(window.kritToast) window.kritToast('Clipboard is not available in this browser.');
  }

  function playOrderSuccessChime(){
    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtx) return;
      var ctx = new AudioCtx();
      var now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach(function(freq, index){
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + index * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.055, now + index * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + index * 0.12);
        osc.stop(now + index * 0.12 + 0.26);
      });
      setTimeout(function(){
        if(ctx && typeof ctx.close === 'function') ctx.close();
      }, 900);
    } catch(_error) {}
  }

  function closeOrderSuccessOverlay(){
    var existing = document.getElementById('krit-order-success-overlay');
    if(!existing) return;
    if(existing._kritEscHandler){
      document.removeEventListener('keydown', existing._kritEscHandler);
    }
    existing.remove();
    var authOverlay = document.getElementById('krit-auth-overlay');
    var orderOverlay = document.getElementById('krit-account-order-overlay');
    if(!(authOverlay && authOverlay.classList.contains('open')) && !orderOverlay){
      document.body.style.overflow = '';
    }
  }

  function openOrderSuccessOverlay(order){
    if(!order) return;
    closeOrderSuccessOverlay();
    window._kritLastConfirmedOrder = order;
    if(!Array.isArray(window._kritAccountOrders)) window._kritAccountOrders = [];
    if(!window._kritAccountOrders.some(function(entry){ return entry && String(entry.id) === String(order.id); })){
      window._kritAccountOrders.unshift(order);
    }
    var firstItem = order.items && order.items[0] ? order.items[0] : null;
    var paymentLabel = order.paymentLabel || order.paymentMode || 'Website';
    var total = 'Rs ' + Number(order.total || 0).toLocaleString('en-IN');
    var createdLabel = order.createdLabel || formatOrderDateLabel(order.createdAt || new Date().toISOString());
    var overlay = document.createElement('div');
    overlay.id = 'krit-order-success-overlay';
    overlay.className = 'krit-order-success-overlay';
    overlay.onclick = function(event){
      if(event.target === overlay) closeOrderSuccessOverlay();
    };

    overlay.innerHTML = [
      '<div class="krit-order-success-dialog">',
        '<button type="button" class="krit-order-success-close" aria-label="Close order confirmation">&times;</button>',
        '<div class="krit-order-success-head">',
          '<div class="krit-order-success-badge">',
            '<span class="krit-order-success-check">✓</span>',
            '<span>Order received successfully</span>',
          '</div>',
          '<div class="krit-order-success-hero">',
            '<div class="krit-order-success-hero-icon" aria-hidden="true">🎉</div>',
            '<div class="krit-order-success-hero-copy">',
              '<h2 class="krit-order-success-title">Your KRIT order is confirmed</h2>',
              '<p class="krit-order-success-copy">You are all set. We have saved your order, started the OMS sync, and you can track the latest status instantly from here.</p>',
            '</div>',
          '</div>',
          '<div class="krit-order-success-celebration">',
            '<span>Confirmed</span>',
            '<span>Saved</span>',
            '<span>Synced</span>',
            '<span>Trackable now</span>',
          '</div>',
        '</div>',
        '<div class="krit-order-success-grid">',
          '<div class="krit-order-success-card highlight">',
            '<div class="krit-order-success-label">Order ID</div>',
            '<div class="krit-order-success-value">' + escapeHtml(order.id) + '</div>',
            '<div class="krit-order-success-note">Keep this ID handy for support and tracking.</div>',
          '</div>',
          '<div class="krit-order-success-card customer">',
            '<div class="krit-order-success-label">Customer</div>',
            '<div class="krit-order-success-value">' + escapeHtml((order.customer && order.customer.name) || 'KRIT Customer') + '</div>',
            '<div class="krit-order-success-note">' + escapeHtml([(order.customer && order.customer.phone) || '', (order.customer && order.customer.city) || ''].filter(Boolean).join(' • ')) + '</div>',
          '</div>',
        '</div>',
        '<div class="krit-order-success-card order">',
          '<div class="krit-order-success-orderhead">',
            '<div>',
              '<div class="krit-order-success-label">Payment</div>',
              '<div class="krit-order-success-payment">' + escapeHtml(paymentLabel) + '</div>',
            '</div>',
            '<div class="krit-order-success-chip ' + (String(order.paymentState || 'pending') === 'paid' ? 'paid' : 'pending') + '">' + escapeHtml(String(order.paymentState || 'pending') === 'paid' ? 'Paid' : 'Pending') + '</div>',
          '</div>',
          '<div class="krit-order-success-productrow">',
            '<div>',
              '<div class="krit-order-success-product">' + escapeHtml(firstItem ? firstItem.name : 'KRIT order') + '</div>',
              '<div class="krit-order-success-meta">' + escapeHtml((firstItem ? ((firstItem.qty || 1) + ' item' + ((firstItem.qty || 1) > 1 ? 's' : '')) : '1 order') + ' • ' + createdLabel) + '</div>',
            '</div>',
            '<div class="krit-order-success-total">' + escapeHtml(total) + '</div>',
          '</div>',
          '<div class="krit-order-success-statusbar">',
            '<div class="krit-order-success-statuscopy">We have captured your request. You can track order progress right away, and payment / shipping updates will appear here as your OMS status changes.</div>',
          '</div>',
          '<div class="krit-order-success-mini-grid">',
            '<div class="krit-order-success-mini-card success"><span>OMS sync</span><strong>' + escapeHtml(order.erpSyncState === 'synced' ? 'Connected' : 'In progress') + '</strong><em>' + escapeHtml(order.erpSyncState === 'synced' ? 'Visible to KRIT team now' : 'Refreshing in the background') + '</em></div>',
            '<div class="krit-order-success-mini-card notice"><span>Tracking</span><strong>' + escapeHtml(order.trackingNumber || 'Opens now') + '</strong><em>' + escapeHtml(order.trackingNumber ? 'Shipment details are available' : 'Timeline opens instantly below') + '</em></div>',
            '<div class="krit-order-success-mini-card contact"><span>Updates</span><strong>' + escapeHtml(order.notificationState === 'manual_ready' ? 'Manual ready' : 'Ready') + '</strong><em>' + escapeHtml('Use the quick actions below to open WhatsApp and copy your message.') + '</em></div>',
          '</div>',
        '</div>',
        '<div class="krit-order-success-actions">',
          '<button type="button" class="krit-btn krit-btn-primary krit-order-success-track">Track this order</button>',
          '<button type="button" class="krit-btn krit-btn-secondary krit-order-success-customer-wa">Customer WhatsApp</button>',
          '<button type="button" class="krit-btn krit-btn-secondary krit-order-success-owner-wa">Owner WhatsApp</button>',
          '<button type="button" class="krit-btn krit-btn-secondary krit-order-success-copy">Copy customer text</button>',
          '<button type="button" class="krit-btn krit-btn-secondary krit-order-success-continue">Continue shopping</button>',
        '</div>',
      '</div>'
    ].join('');

    var closeBtn = overlay.querySelector('.krit-order-success-close');
    var trackBtn = overlay.querySelector('.krit-order-success-track');
    var customerWaBtn = overlay.querySelector('.krit-order-success-customer-wa');
    var ownerWaBtn = overlay.querySelector('.krit-order-success-owner-wa');
    var copyBtn = overlay.querySelector('.krit-order-success-copy');
    var continueBtn = overlay.querySelector('.krit-order-success-continue');
    var customerMessage = buildCustomerOrderWhatsAppMessage(order);
    var ownerMessage = buildOwnerOrderWhatsAppMessage(order);
    if(closeBtn) closeBtn.onclick = closeOrderSuccessOverlay;
    if(continueBtn) continueBtn.onclick = closeOrderSuccessOverlay;
    if(trackBtn){
      trackBtn.onclick = function(){
        closeOrderSuccessOverlay();
        setTimeout(function(){
          openAccountOrderTracker(order.id);
        }, 60);
      };
    }
    if(customerWaBtn){
      customerWaBtn.onclick = function(){
        openWhatsAppMessage(order && order.customer && order.customer.phone, customerMessage);
      };
    }
    if(ownerWaBtn){
      ownerWaBtn.onclick = function(){
        openWhatsAppMessage(KRIT_OWNER_WHATSAPP_NUMBER, ownerMessage);
      };
    }
    if(copyBtn){
      copyBtn.onclick = function(){
        copyKritMessage(customerMessage, 'Customer message');
      };
    }
    overlay._kritEscHandler = function(event){
      if(event.key === 'Escape') closeOrderSuccessOverlay();
    };
    document.addEventListener('keydown', overlay._kritEscHandler);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    playOrderSuccessChime();
  }

  function openOrderSuccessOverlaySafely(order, fallback){
    try {
      openOrderSuccessOverlay(order);
      return order;
    } catch(error){
      console.error('KRIT order confirmation overlay failed:', error);
      if(typeof fallback === 'function'){
        try {
          fallback(order);
          return order;
        } catch(fallbackError){
          console.error('KRIT order confirmation fallback failed:', fallbackError);
        }
      }
      if(window.kritToast) window.kritToast('Your order was saved. Please refresh once to view confirmation.');
      return order;
    }
  }

  window.__kritSharedOrderOverlay = function(order, fallback){
    return openOrderSuccessOverlaySafely(order, fallback);
  };

  function patchOrderSync(){
    if(typeof window.kritCreateOrderRecord === 'function' && !window.kritCreateOrderRecord.__kritERP){
      var original = window.kritCreateOrderRecord;
      window.kritCreateOrderRecord = function(){
        var order = original.apply(this, arguments);
        syncOrderToERP(order);
        return order;
      };
      window.kritCreateOrderRecord.__kritERP = true;
    }
  }

  function patchCheckoutOpen(){
    if(typeof window.kritOpenCheckout === 'function' && !window.kritOpenCheckout.__kritEnhanced){
      var original = window.kritOpenCheckout;
      window.__kritOpenCheckoutOriginal = original;
      window.kritOpenCheckout = function(){
        var result = original.apply(this, arguments);
        setTimeout(enhanceCheckoutOverlay, 30);
        setTimeout(enhanceCheckoutOverlay, 180);
        return result;
      };
      window.kritOpenCheckout.__kritEnhanced = true;
    }
  }

  function patchPersistAccount(){
    if(typeof window.kritPersistAccount === 'function' && !window.kritPersistAccount.__kritStored){
      var original = window.kritPersistAccount;
      window.kritPersistAccount = function(profile){
        var result = original.apply(this, arguments);
        try {
          var queue = JSON.parse(localStorage.getItem('krit_customer_sync_queue') || '[]');
          queue.unshift({ profile: profile, queuedAt: new Date().toISOString(), state: 'ready_for_backend_sync' });
          localStorage.setItem('krit_customer_sync_queue', JSON.stringify(queue.slice(0,50)));
        } catch(e){}
        return result;
      };
      window.kritPersistAccount.__kritStored = true;
    }
  }

  function patchOrderConfirmation(){
    if(typeof window.kritShowOrderConfirmation === 'function' && !window.kritShowOrderConfirmation.__kritShared){
      var originalShowOrderConfirmation = window.kritShowOrderConfirmation;
      window.kritShowOrderConfirmation = function(order){
        return openOrderSuccessOverlaySafely(order, originalShowOrderConfirmation);
      };
      window.kritShowOrderConfirmation.__kritShared = true;
    }
    if(typeof window.kritCloseOverlay !== 'function' || !window.kritCloseOverlay.__kritSuccessAware){
      var closeOriginal = window.kritCloseOverlay;
      window.kritCloseOverlay = function(id){
        if(id === 'krit-order-success-overlay'){
          closeOrderSuccessOverlay();
          return;
        }
        if(typeof closeOriginal === 'function') return closeOriginal.apply(this, arguments);
      };
      window.kritCloseOverlay.__kritSuccessAware = true;
    }
  }

  function enhance(){
    ensureKritOverlayStyles();
    mobilePanel();
    patchStoreActions();
    patchCheckoutOpen();
    patchOrderSync();
    patchPersistAccount();
    patchOrderConfirmation();
    enhanceCheckoutOverlay();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();
  window.addEventListener('load', enhance);
  setTimeout(enhance, 300);
  setTimeout(enhance, 900);
})();




