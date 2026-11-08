/* KRIT delivery date — "Enter PIN code → Delivered by Thu, 12 Nov" on the
   product panel. Dates come from /api/delivery-estimate (Kudlu warehouse →
   customer PIN, Shiprocket transit days; 2 PM cut-off for same-day dispatch).
   The last PIN used is remembered on this device. */
(function(){
  'use strict';
  var KEY = 'krit_pin';
  var CSS = '.krit-eta{margin:14px 0 4px;padding:12px 14px;border:1px solid rgba(47,93,168,.22);border-radius:12px;background:rgba(6,14,28,.55)}'
    + '.krit-eta label{display:block;font-size:.66rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8899BB;margin-bottom:8px}'
    + '.krit-eta-row{display:flex;gap:8px}'
    + '.krit-eta input{flex:1;min-width:0;padding:10px 12px;border-radius:9px;border:1px solid rgba(47,93,168,.3);background:rgba(3,8,15,.8);color:#F0F4FF;font-size:.9rem;letter-spacing:.08em}'
    + '.krit-eta button{padding:10px 14px;border-radius:9px;border:1px solid rgba(96,165,250,.35);background:rgba(47,93,168,.22);color:#9cc4ff;font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer}'
    + '.krit-eta-out{font-size:.84rem;margin-top:8px;color:#8899BB;min-height:1.1em;line-height:1.5}'
    + '.krit-eta-out strong{color:#61d88e}.krit-eta-out.bad{color:#ff9b9b}';

  function saved(){ try { return localStorage.getItem(KEY) || ''; } catch(e){ return ''; } }
  function save(pin){ try { localStorage.setItem(KEY, pin); } catch(e){} }
  function fmt(ymd){
    var p = String(ymd || '').split('-'); if(p.length !== 3) return '';
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    try { return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); } catch(e){ return d.toDateString(); }
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

  var cache = {};
  function estimate(pin, cod){
    var key = pin + '|' + (cod ? 1 : 0);
    if(cache[key] && Date.now() - cache[key].at < 10 * 60 * 1000) return Promise.resolve(cache[key].body);
    return fetch('/api/delivery-estimate?pincode=' + encodeURIComponent(pin) + '&cod=' + (cod ? 1 : 0), { credentials: 'same-origin', cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(body){ if(body && body.ok) cache[key] = { at: Date.now(), body: body }; return body; });
  }
  window.kritDeliveryEstimate = estimate;

  function check(box){
    var input = box.querySelector('input'), out = box.querySelector('.krit-eta-out');
    var pin = (input.value || '').replace(/\D/g, '');
    input.value = pin;
    if(pin.length !== 6){ out.className = 'krit-eta-out bad'; out.textContent = 'Enter your 6-digit PIN code.'; return; }
    out.className = 'krit-eta-out'; out.textContent = 'Checking…';
    estimate(pin, false).then(function(d){
      if(!d || !d.ok){ out.className = 'krit-eta-out bad'; out.textContent = (d && d.error) || 'Could not check this PIN code.'; return; }
      if(!d.serviceable){ out.className = 'krit-eta-out bad'; out.textContent = d.error || 'Delivery is not available at this PIN code yet.'; return; }
      save(pin);
      out.className = 'krit-eta-out';
      out.innerHTML = '🚚 Delivered by <strong>' + esc(fmt(d.date)) + '</strong> to ' + esc(pin)
        + (d.dispatchToday ? ' · order before 2 PM to ship today' : '') + ' · Free delivery';
    }).catch(function(){ out.className = 'krit-eta-out bad'; out.textContent = 'Could not check right now. Please try again.'; });
  }

  function attach(){
    var btn = document.querySelector('button[onclick*="kritDetailAddToCart"],button[onclick*="kritDetailBuyNow"]');
    if(!btn || !btn.parentElement || !btn.parentElement.parentNode) return;
    var group = btn.parentElement;
    if(group.parentNode.querySelector('.krit-eta')) return;
    var box = document.createElement('div');
    box.className = 'krit-eta';
    box.innerHTML = '<label for="krit-eta-pin">Check delivery date</label>'
      + '<div class="krit-eta-row"><input id="krit-eta-pin" type="text" inputmode="numeric" maxlength="6" autocomplete="postal-code" placeholder="Enter PIN code">'
      + '<button type="button">Check</button></div><div class="krit-eta-out" aria-live="polite"></div>';
    group.parentNode.insertBefore(box, group.nextSibling);
    var input = box.querySelector('input');
    box.querySelector('button').addEventListener('click', function(){ check(box); });
    input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); check(box); } });
    input.addEventListener('input', function(){ if(input.value.replace(/\D/g, '').length === 6) check(box); });
    var pin = saved();
    if(pin){ input.value = pin; check(box); }
  }

  function start(){
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    attach();
    var t = null;
    new MutationObserver(function(){ clearTimeout(t); t = setTimeout(attach, 150); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
