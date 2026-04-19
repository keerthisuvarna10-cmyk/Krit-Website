(function(){
  function isMobile(){ return window.matchMedia('(max-width: 768px)').matches; }

  function hookDetailScroll(){
    if(typeof window.kritOpenDetail !== 'function') return;
    var original = window.kritOpenDetail;
    if(original.__kritWrapped) return;
    var wrapped = function(){
      var result = original.apply(this, arguments);
      if(isMobile()){
        var detail = document.getElementById('krit-detail');
        if(detail){
          setTimeout(function(){
            detail.scrollIntoView({behavior:'smooth', block:'start'});
          }, 120);
        }
      }
      return result;
    };
    wrapped.__kritWrapped = true;
    window.kritOpenDetail = wrapped;
  }

  function hookLightboxBackdrop(){
    var overlay = document.getElementById('krit-image-lightbox');
    if(!overlay || overlay.__kritBound) return;
    overlay.addEventListener('click', function(event){
      if(event.target === overlay && typeof window.kritCloseImageLightbox === 'function'){
        window.kritCloseImageLightbox();
      }
    });
    overlay.__kritBound = true;
  }

  function hookLightboxSwipe(){
    var img = document.getElementById('krit-lightbox-img');
    if(!img || img.__kritSwipe) return;
    var startX = 0;
    img.addEventListener('touchstart', function(e){
      startX = e.changedTouches[0].clientX;
    }, {passive:true});
    img.addEventListener('touchend', function(e){
      var endX = e.changedTouches[0].clientX;
      var delta = endX - startX;
      if(Math.abs(delta) < 40) return;
      if(delta < 0 && typeof window.kritStepDetailImage === 'function') window.kritStepDetailImage(1);
      if(delta > 0 && typeof window.kritStepDetailImage === 'function') window.kritStepDetailImage(-1);
    }, {passive:true});
    img.__kritSwipe = true;
  }

  function enhance(){
    hookDetailScroll();
    hookLightboxBackdrop();
    hookLightboxSwipe();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', enhance);
  } else {
    enhance();
  }
  window.addEventListener('load', enhance);
  setTimeout(enhance, 500);
})();
