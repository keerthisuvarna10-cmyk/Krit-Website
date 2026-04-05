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
    if(!profile || !profile.email) return false;
    localStorage.setItem('krit_customer_last_source', source || 'website');
    var cached = [];
    try { cached = JSON.parse(localStorage.getItem('krit_customer_profiles') || '[]'); } catch(e) { cached = []; }
    var existingIndex = cached.findIndex(function(item){ return item.email === profile.email || (item.phone && profile.phone && item.phone === profile.phone); });
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

    if(form && !form.querySelector('.krit-auth-inline-note')){
      var note = document.createElement('div');
      note.className = 'krit-auth-inline-note';
      note.textContent = 'Use Google for one-tap sign-in, or create an email account with a secure password and add your mobile for checkout.';
      form.appendChild(note);
    }

    if(!accountWrap.querySelector('.krit-auth-account-card')){
      accountWrap.innerHTML = [
        '<div class="krit-auth-account-card">',
          '<div class="krit-auth-title" id="auth-account-name">KRIT Customer</div>',
          '<div class="krit-auth-sub">Your details are ready for faster checkout and order updates.</div>',
          '<div class="krit-auth-account-grid">',
            '<div class="krit-auth-account-meta"><div class="label">Email</div><div class="value" id="auth-account-email">hello@kritsleep.in</div></div>',
            '<div class="krit-auth-account-meta"><div class="label">Mobile</div><div class="value" id="auth-account-phone">Add your phone in checkout</div></div>',
          '</div>',
          '<div class="krit-auth-helper">This customer account is synced through Firebase Auth and stored for faster checkout, order updates, and CRM follow-up.</div>',
          '<button class="kd-logout" type="button" onclick="kritLogout()">Logout</button>',
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
  }

  function updateAuthUI(){
    var formWrap = document.getElementById('krit-auth-form-wrap');
    var accountWrap = document.getElementById('krit-auth-account');
    var welcome = document.getElementById('auth-welcome');
    var nameNode = document.getElementById('auth-account-name');
    var emailNode = document.getElementById('auth-account-email');
    var phoneNode = document.getElementById('auth-account-phone');
    if(!formWrap || !accountWrap || !welcome) return;
    if(window._kritAccount && window._kritAccount.email){
      formWrap.style.display = 'none';
      accountWrap.style.display = 'block';
      if(nameNode) nameNode.textContent = window._kritAccount.name || 'KRIT Customer';
      if(emailNode) emailNode.textContent = window._kritAccount.email;
      if(phoneNode) phoneNode.textContent = window._kritAccount.phone ? '+91 ' + window._kritAccount.phone : 'Add your phone during checkout';
      welcome.querySelector('.krit-auth-title').textContent = 'Your KRIT account';
      welcome.querySelector('.krit-auth-sub').textContent = 'Saved details, wishlist continuity, and order visibility in one place.';
    } else {
      formWrap.style.display = 'block';
      accountWrap.style.display = 'none';
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
      setTimeout(function(){ if(typeof window.closeAuthModal === 'function') window.closeAuthModal(); }, 600);
    } catch(error) {
      authMessage('Google login could not be completed. You can still continue with email and password.', 'err');
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
      } catch(error) {
        authMessage('Login failed. Please check your email and password, or create an account first.', 'err');
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
    } catch(error) {
      authMessage('Account creation failed. If this email already exists, please log in instead.', 'err');
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

  async function syncOrderToERP(order){
    if(!order || order.erpSyncState === 'synced' || order.erpSyncState === 'syncing') return;
    order.erpSyncState = 'syncing';
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
      order.erpSyncState = response.ok ? 'synced' : 'failed';
      order.erpSyncAt = new Date().toISOString();
      localStorage.setItem('krit_orders', JSON.stringify(window._kritOrders || []));
      if(response.ok){
        if(window.kritToast) window.kritToast('Order synced to KRIT ERP');
      }
    } catch(error) {
      order.erpSyncState = 'failed';
      order.erpSyncAt = new Date().toISOString();
      localStorage.setItem('krit_orders', JSON.stringify(window._kritOrders || []));
    }
  }

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

  function enhance(){
    mobilePanel();
    patchCheckoutOpen();
    patchOrderSync();
    patchPersistAccount();
    enhanceCheckoutOverlay();
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance);
  else enhance();
  window.addEventListener('load', enhance);
  setTimeout(enhance, 300);
  setTimeout(enhance, 900);
})();




