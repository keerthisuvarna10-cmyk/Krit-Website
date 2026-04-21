/* ═══════════════════════════════════════════════════════════════════
   KRIT Visitor Tracking + Cookie Consent
   ─ Cookie consent banner (navy/gold KRIT theme)
   ─ Unique visitor ID persisted in a 1-year cookie
   ─ Session detection (30-min window)
   ─ Visit count per visitor
   ─ Logs to Firebase Firestore (visits collection) + GA4
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────────────── */
  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var expires = '';
    if (days) {
      var d = new Date();
      d.setTime(d.getTime() + days * 86400000);
      expires = '; expires=' + d.toUTCString();
    }
    document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax';
  }

  function uuid() {
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }) + '-' + Date.now().toString(36);
  }

  function page() {
    var p = window.location.pathname.replace(/\.html$/, '') || '/';
    return p === '/index' ? '/' : p;
  }

  /* ── consent state ────────────────────────────────────────────────── */
  var CONSENT_KEY = 'krit_consent';   // 'accepted' | 'declined'
  var VID_KEY     = 'krit_vid';       // unique visitor id
  var VC_KEY      = 'krit_vc';        // visit count (number)
  var SID_KEY     = 'krit_session';   // present = active session

  var consent = getCookie(CONSENT_KEY);

  /* ── inject consent banner if not yet decided ────────────────────── */
  if (!consent) {
    document.addEventListener('DOMContentLoaded', injectBanner);
  }

  function injectBanner() {
    if (document.getElementById('krit-cookie-banner')) return;

    /* styles */
    var style = document.createElement('style');
    style.textContent = [
      '#krit-cookie-banner{',
        'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);',
        'width:min(640px,calc(100vw - 32px));',
        'background:linear-gradient(135deg,#0c1930 0%,#081420 100%);',
        'border:1px solid rgba(201,168,76,.28);border-radius:18px;',
        'box-shadow:0 20px 50px rgba(0,0,0,.45),0 0 0 1px rgba(201,168,76,.08) inset;',
        'padding:20px 22px;z-index:99999;',
        'display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;',
        'animation:krit-slide-up .35s cubic-bezier(.22,1,.36,1) both;',
      '}',
      '@keyframes krit-slide-up{from{opacity:0;transform:translateX(-50%) translateY(24px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
      '#krit-cookie-banner .kcb-icon{font-size:1.4rem;flex:0 0 auto;margin-top:2px}',
      '#krit-cookie-banner .kcb-body{flex:1;min-width:0}',
      '#krit-cookie-banner .kcb-title{font-family:"DM Sans",sans-serif;font-size:.78rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#C9A84C;margin-bottom:5px}',
      '#krit-cookie-banner .kcb-text{font-size:.82rem;line-height:1.6;color:#AFC0DE;margin:0}',
      '#krit-cookie-banner .kcb-text a{color:#C9A84C;text-decoration:underline}',
      '#krit-cookie-banner .kcb-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}',
      '#krit-cookie-banner .kcb-accept{padding:9px 22px;border-radius:10px;border:none;',
        'background:linear-gradient(135deg,#C9A84C,#E8C96E);color:#1B2340;',
        'font-size:.74rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;',
        'cursor:pointer;white-space:nowrap;',
        'box-shadow:0 8px 18px rgba(201,168,76,.28)}',
      '#krit-cookie-banner .kcb-decline{padding:9px 18px;border-radius:10px;',
        'border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);',
        'color:#8899BB;font-size:.74rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase;',
        'cursor:pointer;white-space:nowrap}',
      '#krit-cookie-banner .kcb-accept:hover{filter:brightness(1.08)}',
      '#krit-cookie-banner .kcb-decline:hover{background:rgba(255,255,255,.1);color:#D8E4F8}',
      '@media(max-width:520px){#krit-cookie-banner{bottom:0;left:0;right:0;transform:none;width:100%;border-radius:18px 18px 0 0;}}'
    ].join('');
    document.head.appendChild(style);

    /* markup */
    var banner = document.createElement('div');
    banner.id = 'krit-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML = [
      '<span class="kcb-icon">🍪</span>',
      '<div class="kcb-body">',
        '<div class="kcb-title">We use cookies</div>',
        '<p class="kcb-text">',
          'KRIT uses cookies to personalise your experience, remember your cart, and understand how visitors use our site. ',
          'Read our <a href="#" onclick="return false">Privacy Policy</a> for details.',
        '</p>',
        '<div class="kcb-actions">',
          '<button class="kcb-accept" id="krit-cookie-accept">Accept cookies</button>',
          '<button class="kcb-decline" id="krit-cookie-decline">Decline</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(banner);

    document.getElementById('krit-cookie-accept').addEventListener('click', function () {
      setCookie(CONSENT_KEY, 'accepted', 365);
      banner.remove();
      initTracking();
    });
    document.getElementById('krit-cookie-decline').addEventListener('click', function () {
      setCookie(CONSENT_KEY, 'declined', 30);
      banner.remove();
    });
  }

  /* ── tracking core ───────────────────────────────────────────────── */
  function initTracking() {
    /* 1. Visitor ID — persistent 1 year */
    var vid = getCookie(VID_KEY);
    if (!vid) {
      vid = uuid();
      setCookie(VID_KEY, vid, 365);
    }

    /* 2. Visit count */
    var vc = parseInt(getCookie(VC_KEY) || '0', 10) + 1;
    setCookie(VC_KEY, String(vc), 365);

    /* 3. Session detection — 30 min */
    var isNewSession = !getCookie(SID_KEY);
    setCookie(SID_KEY, '1', 30 / 1440); // 30 minutes

    var currentPage = page();
    var referrer    = document.referrer ? new URL(document.referrer).hostname : 'direct';
    var ua          = navigator.userAgent;
    var isMobile    = /Mobi|Android|iPhone|iPad/i.test(ua);

    /* 4. GA4 events */
    if (window.kritTrackEvent) {
      kritTrackEvent('page_view', 'navigation', currentPage, 0);
      if (isNewSession) {
        kritTrackEvent('session_start', 'engagement', currentPage, 0);
      }
      if (vc === 1) {
        kritTrackEvent('first_visit', 'acquisition', referrer, 0);
      }
    }

    /* 5. Firebase Firestore — log to 'visits' collection */
    logToFirebase({
      vid:        vid,
      visitCount: vc,
      newSession: isNewSession,
      page:       currentPage,
      referrer:   referrer,
      device:     isMobile ? 'mobile' : 'desktop',
      ts:         new Date().toISOString(),
      url:        window.location.href
    });
  }

  function logToFirebase(data) {
    /* Wait for Firebase to initialise (it loads async) */
    var attempts = 0;
    function tryLog() {
      attempts++;
      if (window._kritDB) {
        window._kritDB.collection('visits').add(
          Object.assign({}, data, {
            serverTs: (window.firebase && window.firebase.firestore)
              ? window.firebase.firestore.FieldValue.serverTimestamp()
              : null
          })
        ).catch(function () { /* silent — non-critical */ });
        return;
      }
      if (attempts < 20) setTimeout(tryLog, 500); // retry up to 10s
    }
    tryLog();
  }

  /* ── auto-init if already consented ─────────────────────────────── */
  if (consent === 'accepted') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTracking);
    } else {
      initTracking();
    }
  }

  /* ── expose helpers for other scripts ───────────────────────────── */
  window.kritTracking = {
    getVisitorId:  function () { return getCookie(VID_KEY); },
    getVisitCount: function () { return parseInt(getCookie(VC_KEY) || '0', 10); },
    hasConsent:    function () { return getCookie(CONSENT_KEY) === 'accepted'; },
    resetConsent:  function () { setCookie(CONSENT_KEY, '', -1); location.reload(); }
  };

})();
