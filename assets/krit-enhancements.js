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
      +       '<div class="krit-storyband-kicker">Designed for Indian sleep routines</div>'
      +       '<h2 class="krit-storyband-title">Cleaner materials, cooler nights, and a pillow shape that actually matches how you sleep.</h2>'
      +       '<p class="krit-storyband-copy">KRIT pairs natural latex support with simple online buying, free shipping across India, and a faster path from browsing to better rest.</p>'
      +     '</div>'
      +     '<div class="krit-storyband-actions">'
      +       '<a class="krit-storyband-link primary" href="#buy">Shop Collection</a>'
      +       '<a class="krit-storyband-link secondary" href="#about">Why KRIT</a>'
      +     '</div>'
      +   '</article>'
      +   '<article class="krit-storyband-card krit-storyband-stat">'
      +     '<div class="krit-storyband-stat-label">Natural Core</div>'
      +     '<div class="krit-storyband-stat-value">100%</div>'
      +     '<p class="krit-storyband-stat-copy">Pure latex feel with breathable rebound and no memory-foam sink.</p>'
      +   '</article>'
      +   '<article class="krit-storyband-card krit-storyband-stat">'
      +     '<div class="krit-storyband-stat-label">Risk Free</div>'
      +     '<div class="krit-storyband-stat-value">30</div>'
      +     '<p class="krit-storyband-stat-copy">Sleep on it at home and decide with a calmer, lower-friction buying experience.</p>'
      +   '</article>'
      +   '<article class="krit-storyband-card krit-storyband-stat">'
      +     '<div class="krit-storyband-stat-label">Fast Fulfilment</div>'
      +     '<div class="krit-storyband-stat-value">2-5</div>'
      +     '<p class="krit-storyband-stat-copy">Typical delivery window for most orders, with built-in order tracking after purchase.</p>'
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
        +   '<div class="krit-shop-intro-kicker">Shop by sleep preference</div>'
        +   '<h2 class="krit-shop-intro-title">Choose the shape that supports your neck, shoulders, and nightly routine best.</h2>'
        +   '<p>Compare height, firmness, and sleep style in one place. The collection below is structured to make browsing feel simpler and more confident.</p>'
        + '</div>'
        + '<div class="krit-shop-chip-row" aria-label="KRIT highlights">'
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
