/* KRIT live stock — shows "Only 3 left" / "Out of stock" and stops customers
   adding more than is available.

   Numbers come from /api/stock, which asks the ERP (Available = On hand −
   pillows reserved for orders not yet shipped). The page refreshes them every
   minute and whenever the tab comes back into view. The server checks stock
   again before payment, so this is for a good experience, not the only guard.

   A product the ERP hasn't linked to the website is left alone (no limit). */
(function(){
  'use strict';
  var STOCK = null;            // { "contour-3": { available: 12, status: "in", lowBadge: 5 } }
  var REFRESH_MS = 60 * 1000;

  function info(id){ return STOCK && id ? STOCK[String(id)] || null : null; }
  function available(id){ var s = info(id); return s ? s.available : Infinity; }
  function productName(id){
    var list = window.KRIT_PRODUCTS || [];
    for(var i = 0; i < list.length; i++) if(list[i].id === id) return list[i].name;
    return 'This pillow';
  }
  function toast(msg){
    if(typeof window.kritToast === 'function'){ try { return window.kritToast(msg); } catch(e){} }
    alert(msg);
  }
  function cartQty(id){
    var cart = Array.isArray(window._cart) ? window._cart : [];
    if(!cart.length){ try { cart = JSON.parse(localStorage.getItem('krit_cart') || '[]') || []; } catch(e){ cart = []; } }
    return cart.reduce(function(sum, item){ return sum + (String(item.id) === String(id) ? Number(item.qty) || 0 : 0); }, 0);
  }
  function idFromName(name){
    var list = window.KRIT_PRODUCTS || [], n = String(name || '').toLowerCase();
    for(var i = 0; i < list.length; i++) if(n.indexOf(list[i].name.toLowerCase()) === 0) return list[i].id;
    return '';
  }

  /* ── Guards on the buttons that add to cart / go to checkout ── */
  function allowed(id, wanted, alreadyInCart){
    var left = available(id);
    if(left === Infinity) return wanted;
    if(left <= 0){ toast('Sorry, ' + productName(id) + ' is out of stock right now.'); return 0; }
    var room = left - (alreadyInCart || 0);
    if(room <= 0){ toast('You already have all ' + left + ' available ' + productName(id) + ' in your cart.'); return 0; }
    if(wanted > room){ toast('Only ' + left + ' ' + productName(id) + ' left — added ' + room + '.'); return room; }
    return wanted;
  }

  // Cart drawer "+" buttons: don't go past what's in stock.
  function wrapCartPlus(fnName){
    var fn = window[fnName];
    if(typeof fn !== 'function' || fn.__kritStock) return;
    var guarded = function(name, delta){
      if(Number(delta) > 0){
        var cart = Array.isArray(window._cart) ? window._cart : [];
        var match = cart.filter(function(i){ return i.name === name; })[0];
        var id = (match && match.id) || idFromName(name);
        var have = 0; cart.forEach(function(i){ if(i.name === name) have += Number(i.qty) || 0; });
        var left = available(id);
        if(have + 1 > left){ toast(left > 0 ? 'Only ' + left + ' ' + productName(id) + ' left in stock.' : 'Sorry, ' + productName(id) + ' is out of stock right now.'); return; }
      }
      return fn.apply(this, arguments);
    };
    guarded.__kritStock = true;
    window[fnName] = guarded;
  }

  function wrap(){
    wrapCartPlus('__kritStorefixUpdateCartItem');
    wrapCartPlus('kritUpdateCartItem');
    var add = window.addToCart;
    if(typeof add === 'function' && !add.__kritStock){
      var guardedAdd = function(name, price, qty, productId){
        var id = productId || idFromName(name);
        var q = allowed(id, Math.max(1, Number(qty) || 1), cartQty(id));
        if(!q) return;
        return add.call(this, name, price, q, productId);
      };
      guardedAdd.__kritStock = true;
      Object.keys(add).forEach(function(k){ guardedAdd[k] = add[k]; });
      window.addToCart = guardedAdd;
    }
    var open = window.kritOpenCheckout;
    if(typeof open === 'function' && !open.__kritStock){
      var guardedOpen = function(items){
        var list = Array.isArray(items) ? items : [];
        for(var i = 0; i < list.length; i++){
          var id = list[i].id || idFromName(list[i].name);
          var q = allowed(id, Math.max(1, Number(list[i].qty) || 1), 0);
          if(!q) return;
          list[i].qty = q;
        }
        return open.apply(this, arguments);
      };
      guardedOpen.__kritStock = true;
      Object.keys(open).forEach(function(k){ guardedOpen[k] = open[k]; });
      window.kritOpenCheckout = guardedOpen;
    }
  }

  /* ── Labels on the page ── */
  var CSS = '.krit-stock-tag{display:inline-block;margin:6px 0 2px;padding:3px 9px;border-radius:999px;font-size:.68rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}'
    + '.krit-stock-tag.low{background:#FFF3D6;color:#8A5A00}'
    + '.krit-stock-tag.out{background:#FDE2E2;color:#A11B1B}'
    + 'button.krit-stock-off{opacity:.45!important;cursor:not-allowed!important;filter:grayscale(.6)}';

  function idOfButton(btn){
    if(btn.getAttribute('data-krit-product')) return btn.getAttribute('data-krit-product');
    var m = String(btn.getAttribute('onclick') || '').match(/krit(?:QuickAdd|BuySingleNow|AddToCart)\(\s*['"]([^'"]+)['"]/);
    if(m) return m[1];
    if(/kritDetail(AddToCart|BuyNow)\(/.test(btn.getAttribute('onclick') || '')){
      var sel = typeof window._kritSelected === 'number' ? window._kritSelected : -1;
      var list = window.KRIT_PRODUCTS || [];
      if(sel >= 0 && list[sel]) return list[sel].id;
      var p = location.pathname.match(/\/product\/([^/?#]+)/) || location.search.match(/[?&]id=([^&#]+)/);
      if(p) return decodeURIComponent(p[1]);
    }
    return '';
  }

  // One "Only 3 left" / "Out of stock" label per product card or panel. A card
  // can have two button rows; the label goes above the first one only.
  function label(btn, id, s){
    var holder = btn.parentElement; if(!holder || !holder.parentNode) return;
    var text = !s ? '' : s.available <= 0 ? 'Out of stock' : s.available <= (s.lowBadge || 5) ? 'Only ' + s.available + ' left' : '';
    var mine = holder.previousElementSibling && holder.previousElementSibling.classList && holder.previousElementSibling.classList.contains('krit-stock-tag')
      ? holder.previousElementSibling : null;
    // Already labelled higher up in the same card?
    var box = holder.parentNode, depth = 0, other = null;
    while(box && box !== document.body && depth < 4 && !other){
      var found = box.querySelectorAll('.krit-stock-tag[data-id="' + id + '"]');
      for(var i = 0; i < found.length; i++) if(found[i] !== mine){ other = found[i]; break; }
      box = box.parentNode; depth++;
    }
    if(!text || other){ if(mine) mine.remove(); return; }
    if(!mine){ mine = document.createElement('div'); holder.parentNode.insertBefore(mine, holder); }
    mine.setAttribute('data-id', id);
    mine.className = 'krit-stock-tag ' + (s.available <= 0 ? 'out' : 'low');
    mine.textContent = text;
  }

  // The product detail panel has a fixed "In stock" pill — keep it honest.
  function detailPill(){
    var list = window.KRIT_PRODUCTS || [];
    var sel = typeof window._kritSelected === 'number' ? window._kritSelected : -1;
    var id = sel >= 0 && list[sel] ? list[sel].id : '';
    var pills = document.querySelectorAll('span[data-krit-stock-pill]');
    if(!pills.length){
      Array.prototype.forEach.call(document.querySelectorAll('span'), function(el){
        if(el.children.length === 0 && el.textContent.trim() === 'In stock') el.setAttribute('data-krit-stock-pill', '1');
      });
      pills = document.querySelectorAll('span[data-krit-stock-pill]');
    }
    var s = info(id);
    Array.prototype.forEach.call(pills, function(el){
      var out = s && s.available <= 0, low = s && !out && s.available <= (s.lowBadge || 5);
      el.textContent = out ? 'Out of stock' : low ? 'Only ' + s.available + ' left' : 'In stock';
      el.style.color = out ? '#ff8a8a' : low ? '#ffd27a' : '#61d88e';
      el.style.background = out ? 'rgba(255,80,80,.1)' : low ? 'rgba(255,190,60,.1)' : 'rgba(37,211,102,.08)';
      el.style.borderColor = out ? 'rgba(255,80,80,.25)' : low ? 'rgba(255,190,60,.25)' : 'rgba(37,211,102,.18)';
    });
  }

  var applying = false;
  function apply(){
    if(!STOCK || applying) return;
    applying = true;
    try {
      var seen = [];
      var buttons = document.querySelectorAll('button[onclick*="kritQuickAdd"],button[onclick*="kritBuySingleNow"],button[onclick*="kritDetailAddToCart"],button[onclick*="kritDetailBuyNow"],button[data-krit-product]');
      Array.prototype.forEach.call(buttons, function(btn){
        var id = idOfButton(btn);
        var s = info(id);
        var out = !!(s && s.available <= 0);
        if(!btn.hasAttribute('data-krit-label')) btn.setAttribute('data-krit-label', btn.textContent);
        btn.classList.toggle('krit-stock-off', out);
        btn.setAttribute('aria-disabled', out ? 'true' : 'false');
        if(out){ btn.textContent = 'Out of Stock'; btn.title = 'Out of stock right now'; }
        else if(btn.textContent === 'Out of Stock'){ btn.textContent = btn.getAttribute('data-krit-label'); btn.title = ''; }
        // One label per button group (card or detail panel)
        var group = btn.parentElement;
        if(group && seen.indexOf(group) === -1){ seen.push(group); label(btn, id, s); }
      });
      detailPill();
    } finally { applying = false; }
  }

  async function refresh(){
    try {
      var r = await fetch('/api/stock', { cache: 'no-store', credentials: 'same-origin' });
      if(!r.ok) return;
      var body = await r.json();
      if(body && body.products){ STOCK = body.products; window.KRIT_STOCK = STOCK; apply(); }
    } catch(e){ /* keep the last numbers */ }
  }

  // Stop clicks on an out-of-stock button before the page's own handler runs.
  document.addEventListener('click', function(e){
    var btn = e.target && e.target.closest ? e.target.closest('button.krit-stock-off') : null;
    if(!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    toast('Sorry, ' + productName(idOfButton(btn)) + ' is out of stock right now.');
  }, true);

  function start(){
    var style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
    wrap(); setTimeout(wrap, 1000);
    refresh();
    setInterval(function(){ if(!document.hidden) refresh(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', function(){ if(!document.hidden) refresh(); });
    // Cards and the detail panel are drawn by script; label them as they appear.
    var t = null;
    new MutationObserver(function(){ if(applying) return; clearTimeout(t); t = setTimeout(apply, 120); })
      .observe(document.body, { childList: true, subtree: true });
  }

  window.kritStock = { refresh: refresh, available: available };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
