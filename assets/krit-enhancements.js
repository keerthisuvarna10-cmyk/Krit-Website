(function(){
  var page = (document.body && document.body.getAttribute('data-krit-page')) || 'index';

  function onReady(fn){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function initScrollNav(){
    var body = document.body;
    if(!body) return;
    var sync = function(){
      body.classList.toggle('krit-nav-scrolled', window.scrollY > 18);
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
  }

  function insertStoryBand(){
    if(page !== 'index') return;
    if(document.querySelector('.krit-storyband')) return;
    var target = document.querySelector('.marquee-wrap');
    if(!target || !target.parentNode) return;
    var section = document.createElement('section');
    section.className = 'krit-storyband krit-fade-up';
    section.innerHTML = ''
      + '<div class="krit-storyband-grid">'
      +   '<article class="krit-storyband-card hero">'
      +     '<div>'
      +       '<div class="krit-storyband-kicker">India\'s only dedicated natural latex pillow website</div>'
      +       '<h2 class="krit-storyband-title">Certified natural latex, honest ecommerce buying, and pillow shapes built for real Indian sleep needs.</h2>'
      +       '<p class="krit-storyband-copy">KRIT brings GOLS-certified natural latex, clear product comparison, free shipping across India, and a cleaner buy-online experience from discovery to checkout.</p>'
      +     '</div>'
      +     '<div class="krit-storyband-actions">'
      +       '<a class="krit-storyband-link primary" href="#buy">Shop Collection</a>'
      +       '<a class="krit-storyband-link secondary" href="#about">See Latex Proof</a>'
      +     '</div>'
      +   '</article>'
      +   '<article class="krit-storyband-card krit-storyband-stat">'
      +     '<div class="krit-storyband-stat-label">Latex Core</div>'
      +     '<div class="krit-storyband-stat-value">100%</div>'
      +     '<p class="krit-storyband-stat-copy">Pure natural latex feel with breathable rebound and no memory-foam sink.</p>'
      +   '</article>'
      +   '<article class="krit-storyband-card krit-storyband-stat">'
      +     '<div class="krit-storyband-stat-label">Certified</div>'
      +     '<div class="krit-storyband-stat-value">GOLS</div>'
      +     '<p class="krit-storyband-stat-copy">Latex backed by certification-led sourcing, traceability, and cleaner material trust.</p>'
      +   '</article>'
      +   '<article class="krit-storyband-card krit-storyband-stat">'
      +     '<div class="krit-storyband-stat-label">Ecommerce Ready</div>'
      +     '<div class="krit-storyband-stat-value">COD</div>'
      +     '<p class="krit-storyband-stat-copy">Shop online with prepaid savings, cash on delivery, and order tracking built into the flow.</p>'
      +   '</article>'
      + '</div>';
    target.parentNode.insertBefore(section, target.nextSibling);
  }

  function decorateShopSection(){
    if(page !== 'index') return;
    var buy = document.getElementById('buy');
    var wrap = buy && buy.querySelector('.wr');
    var head = document.getElementById('krit-shop-head');
    if(!buy || !wrap || !head) return;
    buy.classList.add('krit-shop-shell');
    if(!wrap.querySelector('.krit-shop-intro')){
      var intro = document.createElement('div');
      intro.className = 'krit-shop-intro krit-fade-up';
      intro.innerHTML = ''
        + '<div class="krit-shop-intro-copy">'
        +   '<div class="krit-shop-intro-kicker">Shop the latex collection</div>'
        +   '<h2 class="krit-shop-intro-title">Compare every KRIT latex pillow by shape, height, support profile, and price in one proper ecommerce section.</h2>'
        +   '<p>Browse the full collection, compare sleep-fit details clearly, and move from discovery to checkout without losing the rest of the homepage story.</p>'
        + '</div>'
        + '<div class="krit-shop-chip-row" aria-label="KRIT highlights">'
        +   '<span class="krit-shop-chip">GOLS certified latex</span>'
        +   '<span class="krit-shop-chip">Free shipping</span>'
        +   '<span class="krit-shop-chip">COD available</span>'
        +   '<span class="krit-shop-chip">Quick compare</span>'
        + '</div>';
      wrap.insertBefore(intro, head);
    }
  }

  function insertMobileCta(){
    if(page !== 'index') return;
    if(document.querySelector('.krit-mobile-cta')) return;
    var cta = document.createElement('div');
    cta.className = 'krit-mobile-cta';
    cta.innerHTML = ''
      + '<a href="#buy" class="primary">Shop Now</a>'
      + '<button type="button" class="secondary">Find My Pillow</button>';
    var button = cta.querySelector('button');
    button.addEventListener('click', function(){
      if(typeof window.openQuiz === 'function') window.openQuiz();
    });
    document.body.appendChild(cta);
  }

  function initFadeUps(){
    var nodes = Array.prototype.slice.call(document.querySelectorAll('.krit-fade-up'));
    if(!nodes.length) return;
    if(!('IntersectionObserver' in window)){
      nodes.forEach(function(node){ node.classList.add('krit-in'); });
      return;
    }
    var observer = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('krit-in');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    nodes.forEach(function(node){ observer.observe(node); });
  }

  onReady(function(){
    initScrollNav();
    insertStoryBand();
    decorateShopSection();
    insertMobileCta();
    initFadeUps();
  });
})();
